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
        String cabinNumber,
        boolean available,
        String updatedAt,
        ClassSlotDto currentClass,
        DeviceDto device
) {
    public FacultyDto(
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
        this(
                id,
                name,
                designation,
                qualification,
                college,
                department,
                String.format("Cabin-%02d", id),
                available,
                updatedAt,
                currentClass,
                device
        );
    }
}
