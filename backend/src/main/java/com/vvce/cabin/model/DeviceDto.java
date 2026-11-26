package com.vvce.cabin.model;

/**
 * ESP32 cabin device connection status and Wi-Fi signal metadata.
 */
public record DeviceDto(
        int facultyId,
        String facultyName,
        boolean online,
        String lastSeen,
        String ip,
        Integer rssi,
        String signal,
        String deviceLabel
) {
}
