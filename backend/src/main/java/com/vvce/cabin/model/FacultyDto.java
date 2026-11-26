package com.vvce.cabin.model;

/**
 * Public view of a faculty member's cabin availability, current class, and ESP32 device status.
 */
public record FacultyDto(
        int id,
        String name,
        String designation,
        String qualification,
        String college,
        String department,
        boolean available,
        String updatedAt,
        ClassSlotDto currentClass,
        DeviceDto device
) {
}
