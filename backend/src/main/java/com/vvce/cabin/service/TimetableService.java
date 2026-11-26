package com.vvce.cabin.service;

import com.vvce.cabin.model.ClassSlotDto;
import com.vvce.cabin.repository.CabinRepository.ClassSlotRow;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Computes current and upcoming timetable classes using Asia/Kolkata (IST) time.
 */
@Service
public class TimetableService {

    public static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private static final List<String> TEACHING_DAYS = List.of("MON", "TUE", "WED", "THU", "FRI", "SAT");
    private static final Map<DayOfWeek, String> DAY_MAP = Map.of(
            DayOfWeek.MONDAY, "MON",
            DayOfWeek.TUESDAY, "TUE",
            DayOfWeek.WEDNESDAY, "WED",
            DayOfWeek.THURSDAY, "THU",
            DayOfWeek.FRIDAY, "FRI",
            DayOfWeek.SATURDAY, "SAT",
            DayOfWeek.SUNDAY, "SUN"
    );

    private static final DateTimeFormatter TIME_24H = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter TIME_12H = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH);

    public ZonedDateTime nowIst() {
        return ZonedDateTime.now(IST);
    }

    public String toDayCode(DayOfWeek dayOfWeek) {
        return DAY_MAP.getOrDefault(dayOfWeek, "SUN");
    }

    public ClassSlotDto toDto(ClassSlotRow row) {
        String start24 = row.startTime().format(TIME_24H);
        String end24 = row.endTime().format(TIME_24H);
        String readable = row.startTime().format(TIME_12H) + " - " + row.endTime().format(TIME_12H);
        return new ClassSlotDto(
                row.id(),
                row.section(),
                row.day(),
                start24,
                end24,
                readable,
                row.courseCode(),
                row.courseName(),
                row.room(),
                row.isLab()
        );
    }

    /**
     * Returns the class currently running at nowIst (start_time <= now < end_time), or null.
     */
    public ClassSlotDto findCurrentClass(List<ClassSlotRow> slots, ZonedDateTime nowIst) {
        if (slots == null || slots.isEmpty()) {
            return null;
        }
        String today = toDayCode(nowIst.getDayOfWeek());
        if ("SUN".equals(today)) {
            return null;
        }
        LocalTime nowTime = nowIst.toLocalTime();
        return slots.stream()
                .filter(slot -> today.equals(slot.day()))
                .filter(slot -> !nowTime.isBefore(slot.startTime()) && nowTime.isBefore(slot.endTime()))
                .findFirst()
                .map(this::toDto)
                .orElse(null);
    }

    /**
     * Looks ahead through the weekly MON-SAT schedule (wrapping Saturday -> Monday, skipping Sunday).
     * Returns null only if the faculty member has no scheduled classes at all.
     */
    public ClassSlotDto findNextClass(List<ClassSlotRow> slots, ZonedDateTime nowIst) {
        if (slots == null || slots.isEmpty()) {
            return null;
        }

        List<ClassSlotRow> sorted = slots.stream()
                .sorted(Comparator
                        .comparingInt((ClassSlotRow s) -> TEACHING_DAYS.indexOf(s.day()))
                        .thenComparing(ClassSlotRow::startTime))
                .toList();

        String today = toDayCode(nowIst.getDayOfWeek());
        if ("SUN".equals(today)) {
            return toDto(sorted.get(0));
        }

        LocalTime nowTime = nowIst.toLocalTime();
        ClassSlotRow laterToday = sorted.stream()
                .filter(slot -> today.equals(slot.day()) && slot.startTime().isAfter(nowTime))
                .findFirst()
                .orElse(null);
        if (laterToday != null) {
            return toDto(laterToday);
        }

        int todayIndex = TEACHING_DAYS.indexOf(today);
        for (int offset = 1; offset <= TEACHING_DAYS.size(); offset++) {
            String candidateDay = TEACHING_DAYS.get((todayIndex + offset) % TEACHING_DAYS.size());
            ClassSlotRow nextDaySlot = sorted.stream()
                    .filter(slot -> candidateDay.equals(slot.day()))
                    .findFirst()
                    .orElse(null);
            if (nextDaySlot != null) {
                return toDto(nextDaySlot);
            }
        }
        return null;
    }

    /**
     * Checks whether a candidate [newStart, newEnd) slot overlaps any existing slot for the same faculty on that day.
     */
    public Optional<ClassSlotRow> findOverlappingSlot(List<ClassSlotRow> existingForFaculty,
                                                      String day,
                                                      LocalTime newStart,
                                                      LocalTime newEnd,
                                                      Long excludeSlotId) {
        if (existingForFaculty == null || existingForFaculty.isEmpty() || day == null || newStart == null || newEnd == null) {
            return Optional.empty();
        }
        return existingForFaculty.stream()
                .filter(slot -> excludeSlotId == null || slot.id() != excludeSlotId)
                .filter(slot -> day.equalsIgnoreCase(slot.day()))
                .filter(slot -> slot.startTime().isBefore(newEnd) && slot.endTime().isAfter(newStart))
                .findFirst();
    }
}
