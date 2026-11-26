package com.vvce.cabin.controller;

import com.vvce.cabin.model.ClassSlotDto;
import com.vvce.cabin.model.FreeSlotsDto;
import com.vvce.cabin.model.FreeSlotsDto.FreeSlotItem;
import com.vvce.cabin.model.SectionTimetableDto;
import com.vvce.cabin.model.SectionTimetableDto.CourseLegendItem;
import com.vvce.cabin.model.SectionTimetableDto.SectionSlotDto;
import com.vvce.cabin.repository.CabinRepository;
import com.vvce.cabin.repository.CabinRepository.ClassSlotRow;
import com.vvce.cabin.repository.CabinRepository.DetailedSlotRow;
import com.vvce.cabin.repository.CabinRepository.FacultyRow;
import com.vvce.cabin.service.TimetableService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Public endpoints for section-wise timetables and faculty free-slot lookup.
 */
@RestController
@RequestMapping("/api/timetable")
public class TimetableController {

    private static final DateTimeFormatter TIME_24 = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter TIME_12 = DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH);

    private static final Map<String, String> SECTION_ROOMS = Map.of(
            "A", "M510",
            "B", "M511",
            "C", "M509/M515"
    );

    private static final List<LocalTime[]> STANDARD_PERIODS = List.of(
            new LocalTime[]{LocalTime.of(9, 0), LocalTime.of(10, 0)},
            new LocalTime[]{LocalTime.of(10, 0), LocalTime.of(11, 0)},
            new LocalTime[]{LocalTime.of(11, 30), LocalTime.of(12, 30)},
            new LocalTime[]{LocalTime.of(12, 30), LocalTime.of(13, 30)},
            new LocalTime[]{LocalTime.of(14, 30), LocalTime.of(15, 30)},
            new LocalTime[]{LocalTime.of(15, 30), LocalTime.of(16, 30)},
            new LocalTime[]{LocalTime.of(16, 30), LocalTime.of(18, 30)}
    );

    private static final List<String> TEACHING_DAYS = List.of("MON", "TUE", "WED", "THU", "FRI", "SAT");

    private final CabinRepository repository;
    private final TimetableService timetableService;

    public TimetableController(CabinRepository repository, TimetableService timetableService) {
        this.repository = repository;
        this.timetableService = timetableService;
    }

    @GetMapping
    public SectionTimetableDto getSectionTimetable(@RequestParam(defaultValue = "A") String section) {
        String sec = section.trim().toUpperCase(Locale.ROOT);
        if (!SECTION_ROOMS.containsKey(sec)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Section must be A, B, or C");
        }

        List<DetailedSlotRow> raw = repository.findDetailedTimetableBySection(sec);
        List<SectionSlotDto> slots = new ArrayList<>();
        Map<String, LegendAccumulator> legendMap = new LinkedHashMap<>();

        for (DetailedSlotRow row : raw) {
            if (!matchesPdfElectiveSchedule(sec, row)) {
                continue;
            }
            String start24 = row.startTime().format(TIME_24);
            String end24 = row.endTime().format(TIME_24);
            String readable = row.startTime().format(TIME_12) + " - " + row.endTime().format(TIME_12);
            slots.add(new SectionSlotDto(
                    row.id(),
                    row.section(),
                    row.day(),
                    start24,
                    end24,
                    readable,
                    row.courseCode(),
                    row.courseName(),
                    row.facultyId(),
                    row.facultyName(),
                    row.room(),
                    row.isLab()
            ));

            LegendAccumulator acc = legendMap.computeIfAbsent(
                    row.courseCode(),
                    k -> new LegendAccumulator(row.courseCode(), row.courseName(), row.isLab())
            );
            if (row.facultyName() != null) {
                String label = "ALL".equals(row.section()) && row.room() != null
                        ? row.facultyName() + " (" + row.room() + ")"
                        : row.facultyName();
                acc.faculty.add(label);
            }
        }

        List<CourseLegendItem> legend = legendMap.values().stream()
                .map(acc -> new CourseLegendItem(
                        acc.code,
                        acc.name,
                        acc.faculty.isEmpty() ? "—" : String.join(", ", acc.faculty),
                        acc.isLab
                ))
                .toList();

        return new SectionTimetableDto(
                sec,
                SECTION_ROOMS.get(sec),
                "Odd Semester 2026-27",
                "Version 1.0",
                "04-09-2026",
                slots,
                legend
        );
    }

    @GetMapping("/free")
    public FreeSlotsDto getFreeSlots(@RequestParam int facultyId) {
        FacultyRow faculty = repository.findFacultyById(facultyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Faculty not found for id " + facultyId));

        List<ClassSlotRow> busyRows = repository.findTimetableByFacultyId(facultyId);
        List<ClassSlotDto> busySlots = busyRows.stream().map(timetableService::toDto).toList();
        List<FreeSlotItem> freeSlots = new ArrayList<>();

        for (String day : TEACHING_DAYS) {
            for (LocalTime[] period : STANDARD_PERIODS) {
                LocalTime start = period[0];
                LocalTime end = period[1];
                boolean overlaps = busyRows.stream().anyMatch(slot ->
                        day.equals(slot.day())
                                && slot.startTime().isBefore(end)
                                && slot.endTime().isAfter(start));
                if (!overlaps) {
                    freeSlots.add(new FreeSlotItem(
                            day,
                            start.format(TIME_24),
                            end.format(TIME_24),
                            start.format(TIME_12) + " - " + end.format(TIME_12)
                    ));
                }
            }
        }

        return new FreeSlotsDto(
                faculty.id(),
                faculty.name(),
                faculty.designation(),
                busySlots,
                freeSlots
        );
    }

    /**
     * Keeps section grids aligned with the printed PDF where BCIXX504 has WED 14:30 in Sec A
     * and THU 14:30 in Sec B & C.
     */
    private boolean matchesPdfElectiveSchedule(String requestedSection, DetailedSlotRow row) {
        if (!"ALL".equals(row.section()) || !"BCIXX504".equals(row.courseCode())) {
            return true;
        }
        if ("A".equals(requestedSection)) {
            return !("THU".equals(row.day()) && LocalTime.of(14, 30).equals(row.startTime()));
        }
        return !("WED".equals(row.day()) && LocalTime.of(14, 30).equals(row.startTime()));
    }

    private static class LegendAccumulator {
        final String code;
        final String name;
        final boolean isLab;
        final Set<String> faculty = new LinkedHashSet<>();

        LegendAccumulator(String code, String name, boolean isLab) {
            this.code = code;
            this.name = name;
            this.isLab = isLab;
        }
    }
}
