package com.vvce.cabin.model;

import java.util.List;

/**
 * Weekly timetable response for a specific faculty member.
 */
public record FacultyTimetableDto(
        int facultyId,
        String facultyName,
        String designation,
        String department,
        List<ClassSlotDto> classes
) {
}
