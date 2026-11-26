package com.vvce.cabin.service;

import com.vvce.cabin.model.ClassSlotDto;
import com.vvce.cabin.model.DeviceDto;
import com.vvce.cabin.model.FacultyDto;
import com.vvce.cabin.model.FacultyNowDto;
import com.vvce.cabin.model.FacultyTimetableDto;
import com.vvce.cabin.model.NotificationDto;
import com.vvce.cabin.repository.CabinRepository;
import com.vvce.cabin.repository.CabinRepository.ClassSlotRow;
import com.vvce.cabin.repository.CabinRepository.FacultyRow;
import com.vvce.cabin.repository.CabinRepository.NotificationRow;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.sql.Timestamp;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * Coordinates faculty availability reads/updates, timetable lookups, notifications, and SSE broadcasts.
 */
@Service
public class FacultyService {

    private static final DateTimeFormatter TIME_ONLY_IST = DateTimeFormatter.ofPattern("HH:mm:ss");

    private final CabinRepository repository;
    private final TimetableService timetableService;
    private final DeviceService deviceService;
    private final SseService sseService;

    public FacultyService(CabinRepository repository,
                          TimetableService timetableService,
                          DeviceService deviceService,
                          SseService sseService) {
        this.repository = repository;
        this.timetableService = timetableService;
        this.deviceService = deviceService;
        this.sseService = sseService;
    }

    public List<FacultyDto> getAllFaculty() {
        ZonedDateTime nowIst = timetableService.nowIst();
        List<FacultyRow> rows = repository.findAllFaculty();
        Map<Integer, List<ClassSlotRow>> timetables = repository.findAllFacultyTimetables();
        Map<Integer, DeviceDto> deviceMap = deviceService.getDeviceMapByFacultyId();

        return rows.stream()
                .map(row -> toFacultyDto(
                        row,
                        timetables.getOrDefault(row.id(), List.of()),
                        deviceMap.get(row.id()),
                        nowIst))
                .toList();
    }

    public FacultyDto getFacultyById(int facultyId) {
        FacultyRow row = requireFaculty(facultyId);
        ZonedDateTime nowIst = timetableService.nowIst();
        List<ClassSlotRow> slots = repository.findTimetableByFacultyId(facultyId);
        DeviceDto device = deviceService.getDeviceForFaculty(facultyId);
        return toFacultyDto(row, slots, device, nowIst);
    }

    public FacultyDto updateStatus(int facultyId, boolean available, String source, String clientIp) {
        FacultyRow updated = repository.updateFacultyStatus(facultyId, available, source)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Faculty not found for id " + facultyId));

        DeviceDto device = "ESP32".equals(source)
                ? deviceService.recordActivityFromStatusPost(facultyId, clientIp)
                : deviceService.getDeviceForFaculty(facultyId);

        ZonedDateTime nowIst = timetableService.nowIst();
        List<ClassSlotRow> slots = repository.findTimetableByFacultyId(facultyId);
        FacultyDto dto = toFacultyDto(updated, slots, device, nowIst);
        sseService.broadcastStatus(dto);
        return dto;
    }

    public FacultyTimetableDto getFacultyTimetable(int facultyId) {
        FacultyRow faculty = requireFaculty(facultyId);
        List<ClassSlotDto> classes = repository.findTimetableByFacultyId(facultyId).stream()
                .map(timetableService::toDto)
                .toList();
        return new FacultyTimetableDto(
                faculty.id(),
                faculty.name(),
                faculty.designation(),
                faculty.department(),
                classes
        );
    }

    public FacultyNowDto getFacultyNow(int facultyId) {
        FacultyRow faculty = requireFaculty(facultyId);
        ZonedDateTime nowIst = timetableService.nowIst();
        List<ClassSlotRow> slots = repository.findTimetableByFacultyId(facultyId);

        ClassSlotDto currentClass = timetableService.findCurrentClass(slots, nowIst);
        ClassSlotDto nextClass = timetableService.findNextClass(slots, nowIst);

        return new FacultyNowDto(
                faculty.id(),
                faculty.name(),
                faculty.available(),
                timetableService.toDayCode(nowIst.getDayOfWeek()),
                nowIst.format(TIME_ONLY_IST),
                currentClass,
                nextClass
        );
    }

    public List<NotificationDto> getNotifications(int limit) {
        int clamped = Math.max(1, Math.min(limit, 100));
        return repository.findRecentNotifications(clamped).stream()
                .map(this::toNotificationDto)
                .toList();
    }

    private NotificationDto toNotificationDto(NotificationRow row) {
        String createdIso = formatTimestamp(row.eventTime());
        String message;
        if ("DEVICE".equals(row.type())) {
            boolean isOnline = "ONLINE".equals(row.deviceEvent());
            message = isOnline
                    ? "Cabin device for " + row.facultyName() + " is back online"
                    : "Cabin device for " + row.facultyName() + " went offline";
        } else {
            String statusText = Boolean.TRUE.equals(row.available()) ? "Available" : "Not available";
            if ("ADMIN".equals(row.source())) {
                message = row.facultyName() + " set to " + statusText + " by admin";
            } else {
                message = row.facultyName() + " is now " + statusText;
            }
        }
        return new NotificationDto(
                row.id(),
                row.type(),
                row.facultyId(),
                row.facultyName(),
                row.available(),
                row.source(),
                row.deviceEvent(),
                message,
                createdIso
        );
    }

    private FacultyRow requireFaculty(int facultyId) {
        return repository.findFacultyById(facultyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Faculty not found for id " + facultyId));
    }

    private FacultyDto toFacultyDto(FacultyRow row,
                                    List<ClassSlotRow> slots,
                                    DeviceDto device,
                                    ZonedDateTime nowIst) {
        ClassSlotDto currentClass = timetableService.findCurrentClass(slots, nowIst);
        String updatedIso = formatTimestamp(row.updatedAt());
        return new FacultyDto(
                row.id(),
                row.name(),
                row.designation(),
                row.qualification(),
                row.college(),
                row.department(),
                row.available(),
                updatedIso,
                currentClass,
                device
        );
    }

    private String formatTimestamp(Timestamp timestamp) {
        if (timestamp == null) {
            return null;
        }
        return timestamp.toInstant()
                .atZone(TimetableService.IST)
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
    }
}
