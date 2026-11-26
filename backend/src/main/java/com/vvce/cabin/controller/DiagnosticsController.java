package com.vvce.cabin.controller;

import com.vvce.cabin.model.DiagnosticsDto;
import com.vvce.cabin.repository.CabinRepository;
import com.vvce.cabin.service.DiagnosticsService;
import com.vvce.cabin.service.SseService;
import com.vvce.cabin.service.TimetableService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

/**
 * Public connectivity ping and live pipeline diagnostics endpoints.
 */
@RestController
@RequestMapping("/api")
public class DiagnosticsController {

    private final CabinRepository repository;
    private final SseService sseService;
    private final DiagnosticsService diagnosticsService;

    @Value("${server.port:8080}")
    private int serverPort;

    public DiagnosticsController(CabinRepository repository,
                                 SseService sseService,
                                 DiagnosticsService diagnosticsService) {
        this.repository = repository;
        this.sseService = sseService;
        this.diagnosticsService = diagnosticsService;
    }

    @GetMapping("/ping")
    public Map<String, Object> ping() {
        String nowIso = ZonedDateTime.now(TimetableService.IST)
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        return Map.of("ok", true, "time", nowIso);
    }

    @GetMapping("/diagnostics")
    public DiagnosticsDto diagnostics() {
        boolean dbOk = false;
        try {
            dbOk = repository.pingDatabase();
        } catch (Exception ignored) {
            dbOk = false;
        }

        if (dbOk && diagnosticsService.getLastStatusChangeTime() == null) {
            repository.findLatestStatusChangeTimestamp().ifPresent(ts ->
                    diagnosticsService.setLastStatusChangeTimeIfEmpty(
                            ts.toInstant().atZone(TimetableService.IST)
                                    .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)));
        }

        String nowIso = ZonedDateTime.now(TimetableService.IST)
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        return new DiagnosticsDto(
                true,
                dbOk,
                nowIso,
                sseService.getClientCount(),
                diagnosticsService.getLastStatusChangeTime(),
                diagnosticsService.discoverLanUrls(serverPort),
                diagnosticsService.getRecentRequests()
        );
    }
}
