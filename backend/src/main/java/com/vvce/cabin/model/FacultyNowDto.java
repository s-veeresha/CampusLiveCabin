package com.vvce.cabin.model;

/**
 * Current and next class summary for a faculty member in Asia/Kolkata time.
 */
public record FacultyNowDto(
        int facultyId,
        String facultyName,
        boolean available,
        String currentDay,
        String currentTimeIst,
        ClassSlotDto currentClass,
        ClassSlotDto nextClass
) {
}
