package com.vvce.cabin.model;

import java.util.List;

/**
 * Faculty weekly schedule along with free teaching slots across MON-SAT.
 */
public record FreeSlotsDto(
        int facultyId,
        String facultyName,
        String designation,
        List<ClassSlotDto> busySlots,
        List<FreeSlotItem> freeSlots
) {
    public record FreeSlotItem(
            String day,
            String startTime,
            String endTime,
            String time
    ) {
    }
}
