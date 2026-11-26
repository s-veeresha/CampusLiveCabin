package com.vvce.cabin.controller;

import com.vvce.cabin.model.DeviceDto;
import com.vvce.cabin.model.HeartbeatRequest;
import com.vvce.cabin.service.DeviceService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * ESP32 device heartbeat and monitoring endpoints.
 */
@RestController
@RequestMapping("/api/devices")
public class DeviceController {

    private final DeviceService deviceService;

    public DeviceController(DeviceService deviceService) {
        this.deviceService = deviceService;
    }

    @GetMapping
    public List<DeviceDto> listDevices() {
        return deviceService.getAllDevices();
    }

    @PostMapping("/{facultyId}/heartbeat")
    public DeviceDto heartbeat(
            @PathVariable int facultyId,
            @RequestBody(required = false) HeartbeatRequest request,
            HttpServletRequest httpRequest) {
        String ip = (request != null && request.ip() != null && !request.ip().isBlank())
                ? request.ip().trim()
                : ApiKeyInterceptor.extractClientIp(httpRequest);
        Integer rssi = request != null ? request.rssi() : null;
        return deviceService.recordHeartbeat(facultyId, rssi, ip);
    }
}
