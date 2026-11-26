package com.vvce.cabin.controller;

import com.vvce.cabin.model.FacultyDto;
import com.vvce.cabin.model.FacultyNowDto;
import com.vvce.cabin.model.FacultyTimetableDto;
import com.vvce.cabin.model.NotificationDto;
import com.vvce.cabin.model.StatusUpdateRequest;
import com.vvce.cabin.service.DiagnosticsService;
import com.vvce.cabin.service.FacultyService;
import com.vvce.cabin.service.SseService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;

/**
 * Public REST and SSE endpoints for Faculty Cabin Availability.
 */
@RestController
@RequestMapping("/api")
public class FacultyController {

    private static final Logger log = LoggerFactory.getLogger(FacultyController.class);

    private final FacultyService facultyService;
    private final SseService sseService;
    private final DiagnosticsService diagnosticsService;

    public FacultyController(FacultyService facultyService,
                             SseService sseService,
                             DiagnosticsService diagnosticsService) {
        this.facultyService = facultyService;
        this.sseService = sseService;
        this.diagnosticsService = diagnosticsService;
    }

    @GetMapping("/faculty")
    public List<FacultyDto> getAllFaculty() {
        return facultyService.getAllFaculty();
    }

    @GetMapping("/faculty/{id}")
    public FacultyDto getFacultyById(@PathVariable int id) {
        return facultyService.getFacultyById(id);
    }

    @PostMapping("/faculty/{id}/status")
    public FacultyDto updateStatus(
            @PathVariable int id,
            @RequestBody(required = false) StatusUpdateRequest request,
            HttpServletRequest httpRequest) {

        String clientIp = ApiKeyInterceptor.extractClientIp(httpRequest);
        if (request == null || request.available() == null) {
            diagnosticsService.recordStatusRequest(id, null, clientIp, 400, "Missing boolean field 'available'");
            log.warn("[STATUS-POST] 400 Bad Request from={} facultyId={}", clientIp, id);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Request body must contain boolean field 'available'");
        }

        boolean available = request.available();
        try {
            FacultyDto updated = facultyService.updateStatus(id, available, "ESP32", clientIp);
            diagnosticsService.recordStatusRequest(id, available, clientIp, 200, "Updated via ESP32");
            log.info("[STATUS-POST] 200 OK from={} facultyId={} ({}) available={}",
                    clientIp, id, updated.name(), available);
            return updated;
        } catch (ResponseStatusException ex) {
            int code = ex.getStatusCode().value();
            diagnosticsService.recordStatusRequest(id, available, clientIp, code, ex.getReason());
            log.warn("[STATUS-POST] {} from={} facultyId={} error={}", code, clientIp, id, ex.getReason());
            throw ex;
        }
    }

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-cache, no-transform");
        response.setHeader("Pragma", "no-cache");
        response.setHeader("X-Accel-Buffering", "no");
        response.setHeader("Connection", "keep-alive");
        return sseService.subscribe();
    }

    @GetMapping("/faculty/{id}/timetable")
    public FacultyTimetableDto getTimetable(@PathVariable int id) {
        return facultyService.getFacultyTimetable(id);
    }

    @GetMapping("/faculty/{id}/now")
    public FacultyNowDto getNow(@PathVariable int id) {
        return facultyService.getFacultyNow(id);
    }

    @GetMapping("/notifications")
    public List<NotificationDto> getNotifications(@RequestParam(defaultValue = "20") int limit) {
        return facultyService.getNotifications(limit);
    }
}
