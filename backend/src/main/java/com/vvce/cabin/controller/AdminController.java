package com.vvce.cabin.controller;

import com.vvce.cabin.model.AdminModels.AdminSlotDto;
import com.vvce.cabin.model.AdminModels.ChangePasswordRequest;
import com.vvce.cabin.model.AdminModels.CourseDto;
import com.vvce.cabin.model.AdminModels.DeviceLabelRequest;
import com.vvce.cabin.model.AdminModels.FacultyRequest;
import com.vvce.cabin.model.AdminModels.LoginRequest;
import com.vvce.cabin.model.AdminModels.LoginResponse;
import com.vvce.cabin.model.AdminModels.StatusLogDto;
import com.vvce.cabin.model.AdminModels.TimetableSlotRequest;
import com.vvce.cabin.model.DeviceDto;
import com.vvce.cabin.model.DeviceLogDto;
import com.vvce.cabin.model.FacultyDto;
import com.vvce.cabin.model.StatusUpdateRequest;
import com.vvce.cabin.repository.CabinRepository.AdminUserRow;
import com.vvce.cabin.service.AdminAuthService;
import com.vvce.cabin.service.AdminAuthService.AuthResult;
import com.vvce.cabin.service.AdminService;
import com.vvce.cabin.service.DeviceService;
import com.vvce.cabin.service.FacultyService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

/**
 * Protected administrative endpoints for managing faculty, overrides, timetables, logs, and devices.
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminAuthService authService;
    private final AdminService adminService;
    private final FacultyService facultyService;
    private final DeviceService deviceService;

    public AdminController(AdminAuthService authService,
                           AdminService adminService,
                           FacultyService facultyService,
                           DeviceService deviceService) {
        this.authService = authService;
        this.adminService = adminService;
        this.facultyService = facultyService;
        this.deviceService = deviceService;
    }

    @PostMapping("/login")
    public LoginResponse login(@RequestBody(required = false) LoginRequest req, HttpServletResponse response) {
        if (req == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing login body");
        }
        AuthResult result = authService.login(req.username(), req.password());
        ResponseCookie cookie = ResponseCookie.from(AdminAuthInterceptor.ADMIN_COOKIE_NAME, result.token())
                .httpOnly(true)
                .sameSite("Lax")
                .path("/")
                .maxAge(AdminAuthService.TOKEN_TTL_SECONDS)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
        return result.response();
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(HttpServletResponse response) {
        ResponseCookie cookie = ResponseCookie.from(AdminAuthInterceptor.ADMIN_COOKIE_NAME, "")
                .httpOnly(true)
                .sameSite("Lax")
                .path("/")
                .maxAge(0)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
        return Map.of("loggedOut", true);
    }

    @GetMapping("/me")
    public Map<String, Object> me(@RequestAttribute(AdminAuthInterceptor.ATTR_ADMIN_USER) AdminUserRow admin) {
        return Map.of(
                "authenticated", true,
                "username", admin.username(),
                "mustChangePassword", admin.mustChangePassword()
        );
    }

    @PostMapping("/change-password")
    public Map<String, Object> changePassword(
            @RequestAttribute(AdminAuthInterceptor.ATTR_ADMIN_USER) AdminUserRow admin,
            @RequestBody(required = false) ChangePasswordRequest req) {
        if (req == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing password request");
        }
        authService.changePassword(admin.username(), req.currentPassword(), req.newPassword());
        return Map.of("changed", true);
    }

    @GetMapping("/faculty")
    public List<FacultyDto> listFaculty() {
        return facultyService.getAllFaculty();
    }

    @PostMapping("/faculty")
    public FacultyDto createFaculty(@RequestBody(required = false) FacultyRequest req) {
        return adminService.createFaculty(req);
    }

    @PutMapping("/faculty/{id}")
    public FacultyDto updateFaculty(@PathVariable int id, @RequestBody(required = false) FacultyRequest req) {
        return adminService.updateFaculty(id, req);
    }

    @DeleteMapping("/faculty/{id}")
    public Map<String, Object> deleteFaculty(@PathVariable int id) {
        adminService.deleteFaculty(id);
        return Map.of("deleted", true, "id", id);
    }

    @PostMapping("/faculty/{id}/status")
    public FacultyDto overrideStatus(
            @PathVariable int id,
            @RequestBody(required = false) StatusUpdateRequest req,
            HttpServletRequest httpRequest) {
        if (req == null || req.available() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Field 'available' is required");
        }
        return facultyService.updateStatus(id, req.available(), "ADMIN", ApiKeyInterceptor.extractClientIp(httpRequest));
    }

    @GetMapping("/courses")
    public List<CourseDto> listCourses() {
        return adminService.getAllCourses();
    }

    @GetMapping("/timetable")
    public List<AdminSlotDto> listTimetable() {
        return adminService.getAllTimetableSlots();
    }

    @PostMapping("/timetable")
    public AdminSlotDto createSlot(@RequestBody(required = false) TimetableSlotRequest req) {
        return adminService.createTimetableSlot(req);
    }

    @PutMapping("/timetable/{id}")
    public AdminSlotDto updateSlot(@PathVariable long id, @RequestBody(required = false) TimetableSlotRequest req) {
        return adminService.updateTimetableSlot(id, req);
    }

    @DeleteMapping("/timetable/{id}")
    public Map<String, Object> deleteSlot(@PathVariable long id) {
        adminService.deleteTimetableSlot(id);
        return Map.of("deleted", true, "id", id);
    }

    @GetMapping("/logs")
    public List<StatusLogDto> getLogs(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate,
            @RequestParam(defaultValue = "200") int limit) {
        return adminService.getStatusLogs(search, source, fromDate, toDate, limit);
    }

    @GetMapping(value = "/logs/export", produces = "text/csv")
    public ResponseEntity<String> exportLogsCsv(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String source,
            @RequestParam(required = false) String fromDate,
            @RequestParam(required = false) String toDate) {
        List<StatusLogDto> rows = adminService.getStatusLogs(search, source, fromDate, toDate, 1000);
        StringBuilder sb = new StringBuilder("ID,Faculty ID,Faculty Name,Available,Source,Created At (IST)\n");
        for (StatusLogDto row : rows) {
            sb.append(row.id()).append(',')
                    .append(row.facultyId()).append(',')
                    .append('"').append(row.facultyName().replace("\"", "\"\"")).append('"').append(',')
                    .append(row.available() ? "Available" : "Not available").append(',')
                    .append(row.source()).append(',')
                    .append(row.createdAt() != null ? row.createdAt() : "").append('\n');
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"status_logs.csv\"")
                .body(sb.toString());
    }

    @GetMapping("/devices")
    public List<DeviceDto> listDevices() {
        return deviceService.getAllDevices();
    }

    @PutMapping("/devices/{facultyId}/label")
    public Map<String, Object> setDeviceLabel(
            @PathVariable int facultyId,
            @RequestBody(required = false) DeviceLabelRequest req) {
        adminService.updateDeviceLabel(facultyId, req != null ? req.deviceLabel() : null);
        return Map.of("updated", true, "facultyId", facultyId);
    }

    @GetMapping("/devices/logs")
    public List<DeviceLogDto> listDeviceLogs(@RequestParam(defaultValue = "100") int limit) {
        return deviceService.getDeviceLogs(Math.max(1, Math.min(limit, 500)));
    }
}
