package com.vvce.cabin.model;

/**
 * Request body for POST /api/devices/{facultyId}/heartbeat.
 */
public record HeartbeatRequest(
        Integer rssi,
        String ip
) {
}
