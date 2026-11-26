package com.vvce.cabin.model;

import java.util.List;

/**
 * Detailed section timetable response including faculty names and legend entries.
 */
public record SectionTimetableDto(
        String section,
        String defaultRoom,
        String academicTerm,
        String version,
        String effectiveDate,
        List<SectionSlotDto> slots,
        List<CourseLegendItem> legend
) {
    public record SectionSlotDto(
            long id,
            String section,
            String day,
            String startTime,
            String endTime,
            String time,
            String courseCode,
            String courseName,
            Integer facultyId,
            String facultyName,
            String room,
            boolean isLab
    ) {
    }

    public record CourseLegendItem(
            String courseCode,
            String courseName,
            String facultySummary,
            boolean isLab
    ) {
    }
}
