package com.vvce.cabin.service;

import com.vvce.cabin.model.ClassSlotDto;
import com.vvce.cabin.repository.CabinRepository.ClassSlotRow;
import org.junit.jupiter.api.Test;

import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TimetableServiceTest {

    private final TimetableService timetableService = new TimetableService();

    private ClassSlotRow slot(long id, String section, String day, String start, String end, String code) {
        return new ClassSlotRow(
                id,
                1,
                section,
                day,
                LocalTime.parse(start),
                LocalTime.parse(end),
                code,
                "Course " + code,
                "M510",
                false
        );
    }

    @Test
    void returnsCurrentAndLaterSameDayClass() {
        List<ClassSlotRow> slots = List.of(
                slot(1, "A", "THU", "11:30", "12:30", "BMEEK501"),
                slot(2, "A", "THU", "14:30", "15:30", "BCIML503"),
                slot(3, "B", "SAT", "09:00", "10:00", "BCICN502")
        );

        ZonedDateTime thu1145 = ZonedDateTime.of(2026, 11, 26, 11, 45, 0, 0, TimetableService.IST);
        ClassSlotDto current = timetableService.findCurrentClass(slots, thu1145);
        ClassSlotDto next = timetableService.findNextClass(slots, thu1145);

        assertNotNull(current);
        assertEquals("BMEEK501", current.courseCode());
        assertNotNull(next);
        assertEquals("BCIML503", next.courseCode());
        assertEquals("THU", next.day());
    }

    @Test
    void wrapsFromSaturdayToMondayAndSkipsSunday() {
        List<ClassSlotRow> slots = List.of(
                slot(1, "A", "MON", "09:00", "10:00", "BCICN502"),
                slot(2, "C", "SAT", "11:30", "13:30", "BCIML505")
        );

        ZonedDateTime sat1600 = ZonedDateTime.of(2026, 11, 28, 16, 0, 0, 0, TimetableService.IST);
        assertNull(timetableService.findCurrentClass(slots, sat1600));
        ClassSlotDto nextFromSat = timetableService.findNextClass(slots, sat1600);
        assertNotNull(nextFromSat);
        assertEquals("MON", nextFromSat.day());
        assertEquals("BCICN502", nextFromSat.courseCode());

        ZonedDateTime sun1000 = ZonedDateTime.of(2026, 11, 29, 10, 0, 0, 0, TimetableService.IST);
        assertNull(timetableService.findCurrentClass(slots, sun1000));
        ClassSlotDto nextFromSun = timetableService.findNextClass(slots, sun1000);
        assertNotNull(nextFromSun);
        assertEquals("MON", nextFromSun.day());
    }

    @Test
    void returnsNullWhenFacultyHasNoClasses() {
        ZonedDateTime now = ZonedDateTime.of(2026, 11, 26, 10, 0, 0, 0, TimetableService.IST);
        assertNull(timetableService.findCurrentClass(List.of(), now));
        assertNull(timetableService.findNextClass(List.of(), now));
    }

    @Test
    void detectsOverlappingSlotsAndAllowsAdjacentOrSelfEdit() {
        List<ClassSlotRow> existing = List.of(
                slot(10, "A", "MON", "09:00", "11:00", "BCIML505"),
                slot(11, "B", "MON", "11:30", "12:30", "BCIML503")
        );

        assertTrue(timetableService.findOverlappingSlot(
                existing, "MON", LocalTime.of(10, 0), LocalTime.of(11, 0), null).isPresent());

        assertTrue(timetableService.findOverlappingSlot(
                existing, "MON", LocalTime.of(11, 0), LocalTime.of(11, 30), null).isEmpty());

        assertTrue(timetableService.findOverlappingSlot(
                existing, "MON", LocalTime.of(9, 0), LocalTime.of(11, 0), 10L).isEmpty());
    }
}
