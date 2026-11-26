package com.vvce.cabin.model;

/**
 * Represents a single scheduled class slot in the 5th semester timetable.
 */
public record ClassSlotDto(
        long id,
        String section,
        String day,
        String startTime,
        String endTime,
        String time,
        String courseCode,
        String courseName,
        String room,
        boolean isLab
) {
}
