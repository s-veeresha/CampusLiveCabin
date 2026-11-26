package com.vvce.cabin.service;

import com.vvce.cabin.model.DeviceDto;
import com.vvce.cabin.model.DeviceLogDto;
import com.vvce.cabin.repository.CabinRepository;
import com.vvce.cabin.repository.CabinRepository.DeviceLogRow;
import com.vvce.cabin.repository.CabinRepository.DeviceRow;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Tracks ESP32 heartbeats, signal labels, and 90-second offline timeouts.
 */
@Service
public class DeviceService {

    private static final Logger log = LoggerFactory.getLogger(DeviceService.class);
    private static final long OFFLINE_THRESHOLD_SECONDS = 90L;

    private final CabinRepository repository;
    private final SseService sseService;

    public DeviceService(CabinRepository repository, SseService sseService) {
        this.repository = repository;
        this.sseService = sseService;
    }

    public List<DeviceDto> getAllDevices() {
        return repository.findAllDevices().stream()
                .map(this::toDto)
                .toList();
    }

    public Map<Integer, DeviceDto> getDeviceMapByFacultyId() {
        Map<Integer, DeviceDto> map = new LinkedHashMap<>();
        for (DeviceRow row : repository.findAllDevices()) {
            map.put(row.facultyId(), toDto(row));
        }
        return map;
    }

    public DeviceDto getDeviceForFaculty(int facultyId) {
        return repository.findDeviceByFacultyId(facultyId)
                .map(this::toDto)
                .orElse(null);
    }

    public DeviceDto recordHeartbeat(int facultyId, Integer rssi, String ip) {
        repository.findFacultyById(facultyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Faculty not found for id " + facultyId));

        LocalDateTime nowIst = LocalDateTime.now(TimetableService.IST);
        boolean transitionedOnline = repository.upsertDeviceOnline(facultyId, nowIst, ip, rssi);
        DeviceDto dto = repository.findDeviceByFacultyId(facultyId).map(this::toDto).orElseThrow();
        if (transitionedOnline) {
            log.info("[DEVICE] Faculty {} ({}) is back ONLINE (ip={}, rssi={})",
                    facultyId, dto.facultyName(), dto.ip(), dto.rssi());
            sseService.broadcastDevice(dto);
        }
        return dto;
    }

    public DeviceDto recordActivityFromStatusPost(int facultyId, String ip) {
        LocalDateTime nowIst = LocalDateTime.now(TimetableService.IST);
        boolean transitionedOnline = repository.upsertDeviceOnline(facultyId, nowIst, ip, null);
        DeviceDto dto = repository.findDeviceByFacultyId(facultyId).map(this::toDto).orElse(null);
        if (transitionedOnline && dto != null) {
            log.info("[DEVICE] Faculty {} ({}) marked ONLINE via status POST (ip={})",
                    facultyId, dto.facultyName(), dto.ip());
            sseService.broadcastDevice(dto);
        }
        return dto;
    }

    /**
     * Checks every 15 seconds for devices silent longer than 90 seconds and marks them offline.
     */
    @Scheduled(fixedRate = 15000)
    public void sweepStaleDevices() {
        LocalDateTime nowIst = LocalDateTime.now(TimetableService.IST);
        LocalDateTime threshold = nowIst.minusSeconds(OFFLINE_THRESHOLD_SECONDS);
        List<DeviceRow> wentOffline = repository.markStaleDevicesOffline(threshold, nowIst);
        for (DeviceRow row : wentOffline) {
            DeviceDto dto = toDto(row);
            log.info("[DEVICE] Faculty {} ({}) went OFFLINE (lastSeen={})",
                    dto.facultyId(), dto.facultyName(), dto.lastSeen());
            sseService.broadcastDevice(dto);
        }
    }

    public List<DeviceLogDto> getDeviceLogs(int limit) {
        return repository.findDeviceLogs(limit).stream()
                .map(this::toLogDto)
                .toList();
    }

    public DeviceDto toDto(DeviceRow row) {
        String lastSeenIso = row.lastSeen() != null
                ? ZonedDateTime.of(row.lastSeen(), TimetableService.IST).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                : null;
        return new DeviceDto(
                row.facultyId(),
                row.facultyName(),
                row.online(),
                lastSeenIso,
                row.ip(),
                row.rssi(),
                classifySignal(row.rssi()),
                row.deviceLabel()
        );
    }

    private DeviceLogDto toLogDto(DeviceLogRow row) {
        String atIso = ZonedDateTime.of(row.at(), TimetableService.IST)
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        return new DeviceLogDto(row.id(), row.facultyId(), row.facultyName(), row.event(), atIso);
    }

    public static String classifySignal(Integer rssi) {
        if (rssi == null) {
            return "unknown";
        }
        if (rssi >= -65) {
            return "strong";
        }
        if (rssi >= -78) {
            return "ok";
        }
        return "weak";
    }
}
