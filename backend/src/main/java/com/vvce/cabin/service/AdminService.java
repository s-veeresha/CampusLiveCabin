package com.vvce.cabin.service;

import com.vvce.cabin.model.AdminModels.AdminSlotDto;
import com.vvce.cabin.model.AdminModels.CourseDto;
import com.vvce.cabin.model.AdminModels.FacultyRequest;
import com.vvce.cabin.model.AdminModels.StatusLogDto;
import com.vvce.cabin.model.AdminModels.TimetableSlotRequest;
import com.vvce.cabin.model.FacultyDto;
import com.vvce.cabin.repository.CabinRepository;
import com.vvce.cabin.repository.CabinRepository.ClassSlotRow;
import com.vvce.cabin.repository.CabinRepository.DetailedSlotRow;
import com.vvce.cabin.repository.CabinRepository.StatusLogRow;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/**
 * Business logic for admin faculty CRUD, timetable slot validation, and audit logs.
 */
@Service
public class AdminService {

    private static final Set<String> VALID_SECTIONS = Set.of("A", "B", "C", "ALL");
    private static final Set<String> VALID_DAYS = Set.of("MON", "TUE", "WED", "THU", "FRI", "SAT");
    private static final DateTimeFormatter TIME_24 = DateTimeFormatter.ofPattern("HH:mm");

    private final CabinRepository repository;
    private final TimetableService timetableService;
    private final FacultyService facultyService;

    public AdminService(CabinRepository repository,
                        TimetableService timetableService,
                        FacultyService facultyService) {
        this.repository = repository;
        this.timetableService = timetableService;
        this.facultyService = facultyService;
    }

    public FacultyDto createFaculty(FacultyRequest req) {
        validateFacultyRequest(req);
        String dept = (req.department() == null || req.department().isBlank())
                ? "CSE (AI & ML)"
                : req.department().trim();
        int id = repository.insertFaculty(
                req.name().trim(),
                req.designation().trim(),
                req.qualification().trim(),
                dept
        );
        return facultyService.getFacultyById(id);
    }

    public FacultyDto updateFaculty(int id, FacultyRequest req) {
        validateFacultyRequest(req);
        String dept = (req.department() == null || req.department().isBlank())
                ? "CSE (AI & ML)"
                : req.department().trim();
        boolean updated = repository.updateFacultyDetails(
                id,
                req.name().trim(),
                req.designation().trim(),
                req.qualification().trim(),
                dept
        );
        if (!updated) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Faculty not found for id " + id);
        }
        return facultyService.getFacultyById(id);
    }

    public void deleteFaculty(int id) {
        if (!repository.deleteFacultyById(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Faculty not found for id " + id);
        }
    }

    public List<AdminSlotDto> getAllTimetableSlots() {
        return repository.findAllTimetableSlots().stream()
                .map(this::toAdminSlotDto)
                .toList();
    }

    public List<CourseDto> getAllCourses() {
        return repository.findAllCourses().stream()
                .map(m -> new CourseDto(m.get("code"), m.get("name")))
                .toList();
    }

    public AdminSlotDto createTimetableSlot(TimetableSlotRequest req) {
        ValidatedSlot v = validateAndCheckOverlap(req, null);
        long id = repository.insertTimetableSlot(
                v.section(), v.day(), v.start(), v.end(),
                v.courseCode(), v.facultyId(), v.room(), v.isLab()
        );
        return getSlotById(id);
    }

    public AdminSlotDto updateTimetableSlot(long id, TimetableSlotRequest req) {
        ValidatedSlot v = validateAndCheckOverlap(req, id);
        if (!repository.updateTimetableSlot(
                id, v.section(), v.day(), v.start(), v.end(),
                v.courseCode(), v.facultyId(), v.room(), v.isLab())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Timetable slot not found for id " + id);
        }
        return getSlotById(id);
    }

    public void deleteTimetableSlot(long id) {
        if (!repository.deleteTimetableSlot(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Timetable slot not found for id " + id);
        }
    }

    public List<StatusLogDto> getStatusLogs(String search, String source, String fromDate, String toDate, int limit) {
        int clamped = Math.max(1, Math.min(limit, 1000));
        return repository.findStatusLogs(search, source, fromDate, toDate, clamped).stream()
                .map(this::toStatusLogDto)
                .toList();
    }

    public void updateDeviceLabel(int facultyId, String label) {
        repository.findFacultyById(facultyId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Faculty not found for id " + facultyId));
        String cleaned = (label == null || label.isBlank()) ? null : label.trim();
        repository.updateDeviceLabel(facultyId, cleaned);
    }

    private AdminSlotDto getSlotById(long id) {
        return repository.findAllTimetableSlots().stream()
                .filter(r -> r.id() == id)
                .findFirst()
                .map(this::toAdminSlotDto)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Slot not found"));
    }

    private void validateFacultyRequest(FacultyRequest req) {
        if (req == null
                || req.name() == null || req.name().isBlank()
                || req.designation() == null || req.designation().isBlank()
                || req.qualification() == null || req.qualification().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Name, designation, and qualification are required");
        }
    }

    private ValidatedSlot validateAndCheckOverlap(TimetableSlotRequest req, Long excludeSlotId) {
        if (req == null || req.section() == null || req.day() == null
                || req.startTime() == null || req.endTime() == null || req.courseCode() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "section, day, startTime, endTime, and courseCode are required");
        }

        String section = req.section().trim().toUpperCase(Locale.ROOT);
        String day = req.day().trim().toUpperCase(Locale.ROOT);
        String courseCode = req.courseCode().trim().toUpperCase(Locale.ROOT);

        if (!VALID_SECTIONS.contains(section)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Section must be A, B, C, or ALL");
        }
        if (!VALID_DAYS.contains(day)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Day must be MON..SAT");
        }
        if (!repository.courseExists(courseCode)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown course code: " + courseCode);
        }

        LocalTime start;
        LocalTime end;
        try {
            start = LocalTime.parse(req.startTime().trim());
            end = LocalTime.parse(req.endTime().trim());
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid time format (use HH:mm)");
        }
        if (!start.isBefore(end)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "startTime must be before endTime");
        }

        Integer facultyId = req.facultyId();
        if (facultyId != null) {
            repository.findFacultyById(facultyId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Unknown facultyId: " + facultyId));

            List<ClassSlotRow> existing = repository.findTimetableByFacultyId(facultyId);
            Optional<ClassSlotRow> overlap = timetableService.findOverlappingSlot(
                    existing, day, start, end, excludeSlotId
            );
            if (overlap.isPresent()) {
                ClassSlotRow c = overlap.get();
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        String.format("Faculty already has %s (Sec %s) on %s from %s to %s",
                                c.courseCode(), c.section(), c.day(),
                                c.startTime().format(TIME_24), c.endTime().format(TIME_24)));
            }
        }

        String room = (req.room() == null || req.room().isBlank()) ? null : req.room().trim();
        boolean isLab = Boolean.TRUE.equals(req.isLab());
        return new ValidatedSlot(section, day, start, end, courseCode, facultyId, room, isLab);
    }

    private AdminSlotDto toAdminSlotDto(DetailedSlotRow row) {
        return new AdminSlotDto(
                row.id(),
                row.section(),
                row.day(),
                row.startTime().format(TIME_24),
                row.endTime().format(TIME_24),
                row.courseCode(),
                row.courseName(),
                row.facultyId(),
                row.facultyName(),
                row.room(),
                row.isLab()
        );
    }

    private StatusLogDto toStatusLogDto(StatusLogRow row) {
        String iso = row.createdAt() != null
                ? row.createdAt().toInstant().atZone(TimetableService.IST).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                : null;
        return new StatusLogDto(row.id(), row.facultyId(), row.facultyName(), row.available(), row.source(), iso);
    }

    private record ValidatedSlot(
            String section,
            String day,
            LocalTime start,
            LocalTime end,
            String courseCode,
            Integer facultyId,
            String room,
            boolean isLab
    ) {
    }
}
