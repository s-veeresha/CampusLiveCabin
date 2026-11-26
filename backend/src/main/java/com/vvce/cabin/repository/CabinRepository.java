package com.vvce.cabin.repository;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * JDBC data access layer for faculty, timetable, status_log, devices, and device_log tables.
 */
@Repository
public class CabinRepository {

    public record FacultyRow(
            int id,
            String name,
            String designation,
            String qualification,
            String college,
            String department,
            boolean available,
            Timestamp updatedAt
    ) {
    }

    public record ClassSlotRow(
            long id,
            int facultyId,
            String section,
            String day,
            LocalTime startTime,
            LocalTime endTime,
            String courseCode,
            String courseName,
            String room,
            boolean isLab
    ) {
    }

    public record DeviceRow(
            int facultyId,
            String facultyName,
            LocalDateTime lastSeen,
            String ip,
            Integer rssi,
            boolean online,
            String deviceLabel
    ) {
    }

    public record NotificationRow(
            String id,
            String type,
            int facultyId,
            String facultyName,
            Boolean available,
            String source,
            String deviceEvent,
            Timestamp eventTime
    ) {
    }

    public record DetailedSlotRow(
            long id,
            String section,
            String day,
            LocalTime startTime,
            LocalTime endTime,
            String courseCode,
            String courseName,
            Integer facultyId,
            String facultyName,
            String room,
            boolean isLab
    ) {
    }

    public record DeviceLogRow(
            long id,
            int facultyId,
            String facultyName,
            String event,
            LocalDateTime at
    ) {
    }

    public record AdminUserRow(
            int id,
            String username,
            String passwordHash,
            boolean mustChangePassword,
            int failedAttempts,
            LocalDateTime lockedUntil
    ) {
    }

    public record StatusLogRow(
            long id,
            int facultyId,
            String facultyName,
            boolean available,
            String source,
            Timestamp createdAt
    ) {
    }

    private static final RowMapper<FacultyRow> FACULTY_ROW_MAPPER = (rs, rowNum) -> new FacultyRow(
            rs.getInt("id"),
            rs.getString("name"),
            rs.getString("designation"),
            rs.getString("qualification"),
            rs.getString("college"),
            rs.getString("department"),
            rs.getBoolean("available"),
            rs.getTimestamp("updated_at")
    );

    private static final RowMapper<ClassSlotRow> SLOT_ROW_MAPPER = (rs, rowNum) -> new ClassSlotRow(
            rs.getLong("id"),
            rs.getObject("faculty_id") != null ? rs.getInt("faculty_id") : 0,
            rs.getString("section"),
            rs.getString("day"),
            rs.getTime("start_time").toLocalTime(),
            rs.getTime("end_time").toLocalTime(),
            rs.getString("course_code"),
            rs.getString("course_name"),
            rs.getString("room"),
            rs.getBoolean("is_lab")
    );

    private static final RowMapper<DeviceRow> DEVICE_ROW_MAPPER = (rs, rowNum) -> {
        Timestamp ts = rs.getTimestamp("last_seen");
        Integer rssi = rs.getObject("rssi") != null ? rs.getInt("rssi") : null;
        return new DeviceRow(
                rs.getInt("faculty_id"),
                rs.getString("faculty_name"),
                ts != null ? ts.toLocalDateTime() : null,
                rs.getString("ip"),
                rssi,
                rs.getBoolean("online"),
                rs.getString("device_label")
        );
    };

    private static final RowMapper<NotificationRow> NOTIFICATION_ROW_MAPPER = (rs, rowNum) -> {
        Object availObj = rs.getObject("available");
        Boolean available = availObj != null ? rs.getBoolean("available") : null;
        return new NotificationRow(
                rs.getString("event_id"),
                rs.getString("event_type"),
                rs.getInt("faculty_id"),
                rs.getString("faculty_name"),
                available,
                rs.getString("source"),
                rs.getString("device_event"),
                rs.getTimestamp("event_time")
        );
    };

    private static final RowMapper<DetailedSlotRow> DETAILED_SLOT_ROW_MAPPER = (rs, rowNum) -> new DetailedSlotRow(
            rs.getLong("id"),
            rs.getString("section"),
            rs.getString("day"),
            rs.getTime("start_time").toLocalTime(),
            rs.getTime("end_time").toLocalTime(),
            rs.getString("course_code"),
            rs.getString("course_name"),
            rs.getObject("faculty_id") != null ? rs.getInt("faculty_id") : null,
            rs.getString("faculty_name"),
            rs.getString("room"),
            rs.getBoolean("is_lab")
    );

    private static final RowMapper<DeviceLogRow> DEVICE_LOG_ROW_MAPPER = (rs, rowNum) -> new DeviceLogRow(
            rs.getLong("id"),
            rs.getInt("faculty_id"),
            rs.getString("faculty_name"),
            rs.getString("event"),
            rs.getTimestamp("at").toLocalDateTime()
    );

    private static final RowMapper<AdminUserRow> ADMIN_USER_MAPPER = (rs, rowNum) -> {
        Timestamp lockTs = rs.getTimestamp("locked_until");
        return new AdminUserRow(
                rs.getInt("id"),
                rs.getString("username"),
                rs.getString("password_hash"),
                rs.getBoolean("must_change_password"),
                rs.getInt("failed_attempts"),
                lockTs != null ? lockTs.toLocalDateTime() : null
        );
    };

    private static final RowMapper<StatusLogRow> STATUS_LOG_ROW_MAPPER = (rs, rowNum) -> new StatusLogRow(
            rs.getLong("id"),
            rs.getInt("faculty_id"),
            rs.getString("faculty_name"),
            rs.getBoolean("available"),
            rs.getString("source"),
            rs.getTimestamp("created_at")
    );

    private final JdbcTemplate jdbcTemplate;

    public CabinRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public boolean pingDatabase() {
        Integer result = jdbcTemplate.queryForObject("SELECT 1", Integer.class);
        return result != null && result == 1;
    }

    public List<FacultyRow> findAllFaculty() {
        String sql = """
                SELECT id, name, designation, qualification, college, department, available, updated_at
                FROM faculty
                ORDER BY id ASC
                """;
        return jdbcTemplate.query(sql, FACULTY_ROW_MAPPER);
    }

    public Optional<FacultyRow> findFacultyById(int id) {
        String sql = """
                SELECT id, name, designation, qualification, college, department, available, updated_at
                FROM faculty
                WHERE id = ?
                """;
        List<FacultyRow> rows = jdbcTemplate.query(sql, FACULTY_ROW_MAPPER, id);
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    /**
     * Persists a new availability state and records an audit row in status_log.
     */
    @Transactional
    public Optional<FacultyRow> updateFacultyStatus(int id, boolean available, String source) {
        int updated = jdbcTemplate.update(
                "UPDATE faculty SET available = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                available, id
        );
        if (updated == 0) {
            return Optional.empty();
        }
        jdbcTemplate.update(
                "INSERT INTO status_log (faculty_id, available, source) VALUES (?, ?, ?)",
                id, available, source
        );
        return findFacultyById(id);
    }

    public Optional<Timestamp> findLatestStatusChangeTimestamp() {
        List<Timestamp> list = jdbcTemplate.query(
                "SELECT created_at FROM status_log ORDER BY created_at DESC, id DESC LIMIT 1",
                (rs, rowNum) -> rs.getTimestamp("created_at")
        );
        return list.isEmpty() ? Optional.empty() : Optional.ofNullable(list.get(0));
    }

    public List<ClassSlotRow> findTimetableByFacultyId(int facultyId) {
        String sql = """
                SELECT t.id, t.faculty_id, t.section, t.day, t.start_time, t.end_time,
                       t.course_code, c.name AS course_name, t.room, t.is_lab
                FROM timetable t
                JOIN courses c ON t.course_code = c.code
                WHERE t.faculty_id = ?
                ORDER BY FIELD(t.day, 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'), t.start_time ASC, t.section ASC
                """;
        return jdbcTemplate.query(sql, SLOT_ROW_MAPPER, facultyId);
    }

    public Map<Integer, List<ClassSlotRow>> findAllFacultyTimetables() {
        String sql = """
                SELECT t.id, t.faculty_id, t.section, t.day, t.start_time, t.end_time,
                       t.course_code, c.name AS course_name, t.room, t.is_lab
                FROM timetable t
                JOIN courses c ON t.course_code = c.code
                WHERE t.faculty_id IS NOT NULL
                ORDER BY t.faculty_id ASC, FIELD(t.day, 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'), t.start_time ASC
                """;
        List<ClassSlotRow> allSlots = jdbcTemplate.query(sql, SLOT_ROW_MAPPER);
        Map<Integer, List<ClassSlotRow>> grouped = new LinkedHashMap<>();
        for (ClassSlotRow slot : allSlots) {
            grouped.computeIfAbsent(slot.facultyId(), k -> new ArrayList<>()).add(slot);
        }
        return grouped;
    }

    public List<DeviceRow> findAllDevices() {
        String sql = """
                SELECT d.faculty_id, f.name AS faculty_name, d.last_seen, d.ip, d.rssi, d.online, d.device_label
                FROM devices d
                JOIN faculty f ON d.faculty_id = f.id
                ORDER BY d.faculty_id ASC
                """;
        return jdbcTemplate.query(sql, DEVICE_ROW_MAPPER);
    }

    public Optional<DeviceRow> findDeviceByFacultyId(int facultyId) {
        String sql = """
                SELECT d.faculty_id, f.name AS faculty_name, d.last_seen, d.ip, d.rssi, d.online, d.device_label
                FROM devices d
                JOIN faculty f ON d.faculty_id = f.id
                WHERE d.faculty_id = ?
                """;
        List<DeviceRow> list = jdbcTemplate.query(sql, DEVICE_ROW_MAPPER, facultyId);
        return list.isEmpty() ? Optional.empty() : Optional.of(list.get(0));
    }

    /**
     * Upserts device heartbeat/activity and returns true if this transitioned the device to online.
     */
    @Transactional
    public boolean upsertDeviceOnline(int facultyId, LocalDateTime seenAt, String ip, Integer rssi) {
        Optional<DeviceRow> existing = findDeviceByFacultyId(facultyId);
        boolean wasOfflineOrNew = existing.isEmpty() || !existing.get().online();
        Timestamp ts = Timestamp.valueOf(seenAt);

        if (existing.isEmpty()) {
            jdbcTemplate.update(
                    "INSERT INTO devices (faculty_id, last_seen, ip, rssi, online) VALUES (?, ?, ?, ?, TRUE)",
                    facultyId, ts, ip, rssi
            );
        } else {
            jdbcTemplate.update(
                    """
                    UPDATE devices
                    SET last_seen = ?,
                        ip = COALESCE(?, ip),
                        rssi = COALESCE(?, rssi),
                        online = TRUE
                    WHERE faculty_id = ?
                    """,
                    ts, ip, rssi, facultyId
            );
        }

        if (wasOfflineOrNew) {
            jdbcTemplate.update(
                    "INSERT INTO device_log (faculty_id, event, at) VALUES (?, 'ONLINE', ?)",
                    facultyId, ts
            );
        }
        return wasOfflineOrNew;
    }

    @Transactional
    public List<DeviceRow> markStaleDevicesOffline(LocalDateTime thresholdTime, LocalDateTime transitionedAt) {
        String selectSql = """
                SELECT d.faculty_id, f.name AS faculty_name, d.last_seen, d.ip, d.rssi, d.online, d.device_label
                FROM devices d
                JOIN faculty f ON d.faculty_id = f.id
                WHERE d.online = TRUE AND (d.last_seen IS NULL OR d.last_seen < ?)
                """;
        Timestamp thresholdTs = Timestamp.valueOf(thresholdTime);
        List<DeviceRow> stale = jdbcTemplate.query(selectSql, DEVICE_ROW_MAPPER, thresholdTs);
        if (stale.isEmpty()) {
            return List.of();
        }

        Timestamp transitionTs = Timestamp.valueOf(transitionedAt);
        for (DeviceRow row : stale) {
            jdbcTemplate.update("UPDATE devices SET online = FALSE WHERE faculty_id = ?", row.facultyId());
            jdbcTemplate.update(
                    "INSERT INTO device_log (faculty_id, event, at) VALUES (?, 'OFFLINE', ?)",
                    row.facultyId(), transitionTs
            );
        }

        List<DeviceRow> updated = new ArrayList<>();
        for (DeviceRow row : stale) {
            findDeviceByFacultyId(row.facultyId()).ifPresent(updated::add);
        }
        return updated;
    }

    public List<NotificationRow> findRecentNotifications(int limit) {
        String sql = """
                SELECT event_id, event_type, faculty_id, faculty_name, available, source, device_event, event_time
                FROM (
                    SELECT CONCAT('status-', s.id) AS event_id,
                           'STATUS' AS event_type,
                           s.faculty_id,
                           f.name AS faculty_name,
                           s.available AS available,
                           s.source AS source,
                           NULL AS device_event,
                           s.created_at AS event_time
                    FROM status_log s
                    JOIN faculty f ON s.faculty_id = f.id
                    UNION ALL
                    SELECT CONCAT('device-', d.id) AS event_id,
                           'DEVICE' AS event_type,
                           d.faculty_id,
                           f.name AS faculty_name,
                           NULL AS available,
                           'DEVICE' AS source,
                           d.event AS device_event,
                           d.at AS event_time
                    FROM device_log d
                    JOIN faculty f ON d.faculty_id = f.id
                ) AS events
                ORDER BY event_time DESC
                LIMIT ?
                """;
        return jdbcTemplate.query(sql, NOTIFICATION_ROW_MAPPER, limit);
    }

    public List<DeviceLogRow> findDeviceLogs(int limit) {
        String sql = """
                SELECT d.id, d.faculty_id, f.name AS faculty_name, d.event, d.at
                FROM device_log d
                JOIN faculty f ON d.faculty_id = f.id
                ORDER BY d.at DESC, d.id DESC
                LIMIT ?
                """;
        return jdbcTemplate.query(sql, DEVICE_LOG_ROW_MAPPER, limit);
    }

    public List<DetailedSlotRow> findDetailedTimetableBySection(String section) {
        String sql = """
                SELECT t.id, t.section, t.day, t.start_time, t.end_time,
                       t.course_code, c.name AS course_name,
                       t.faculty_id, f.name AS faculty_name,
                       t.room, t.is_lab
                FROM timetable t
                JOIN courses c ON t.course_code = c.code
                LEFT JOIN faculty f ON t.faculty_id = f.id
                WHERE t.section = ? OR t.section = 'ALL'
                ORDER BY FIELD(t.day, 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'),
                         t.start_time ASC,
                         t.faculty_id ASC
                """;
        return jdbcTemplate.query(sql, DETAILED_SLOT_ROW_MAPPER, section);
    }

    public List<DetailedSlotRow> findAllTimetableSlots() {
        String sql = """
                SELECT t.id, t.section, t.day, t.start_time, t.end_time,
                       t.course_code, c.name AS course_name,
                       t.faculty_id, f.name AS faculty_name,
                       t.room, t.is_lab
                FROM timetable t
                JOIN courses c ON t.course_code = c.code
                LEFT JOIN faculty f ON t.faculty_id = f.id
                ORDER BY FIELD(t.section, 'A', 'B', 'C', 'ALL'),
                         FIELD(t.day, 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'),
                         t.start_time ASC,
                         t.id ASC
                """;
        return jdbcTemplate.query(sql, DETAILED_SLOT_ROW_MAPPER);
    }

    public List<Map<String, String>> findAllCourses() {
        return jdbcTemplate.query(
                "SELECT code, name FROM courses ORDER BY code ASC",
                (rs, rowNum) -> Map.of("code", rs.getString("code"), "name", rs.getString("name"))
        );
    }

    public boolean courseExists(String code) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM courses WHERE code = ?",
                Integer.class,
                code
        );
        return count != null && count > 0;
    }

    public int insertFaculty(String name, String designation, String qualification, String department) {
        Integer nextId = jdbcTemplate.queryForObject("SELECT COALESCE(MAX(id), 0) + 1 FROM faculty", Integer.class);
        int id = nextId != null ? nextId : 1;
        jdbcTemplate.update(
                "INSERT INTO faculty (id, name, designation, qualification, department) VALUES (?, ?, ?, ?, ?)",
                id, name, designation, qualification, department
        );
        return id;
    }

    public boolean updateFacultyDetails(int id, String name, String designation, String qualification, String department) {
        int rows = jdbcTemplate.update(
                "UPDATE faculty SET name = ?, designation = ?, qualification = ?, department = ? WHERE id = ?",
                name, designation, qualification, department, id
        );
        return rows > 0;
    }

    @Transactional
    public boolean deleteFacultyById(int id) {
        jdbcTemplate.update("UPDATE timetable SET faculty_id = NULL WHERE faculty_id = ?", id);
        jdbcTemplate.update("DELETE FROM status_log WHERE faculty_id = ?", id);
        jdbcTemplate.update("DELETE FROM device_log WHERE faculty_id = ?", id);
        jdbcTemplate.update("DELETE FROM devices WHERE faculty_id = ?", id);
        return jdbcTemplate.update("DELETE FROM faculty WHERE id = ?", id) > 0;
    }

    public long insertTimetableSlot(String section, String day, LocalTime start, LocalTime end,
                                    String courseCode, Integer facultyId, String room, boolean isLab) {
        jdbcTemplate.update(
                """
                INSERT INTO timetable (section, day, start_time, end_time, course_code, faculty_id, room, is_lab)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                section, day, java.sql.Time.valueOf(start), java.sql.Time.valueOf(end),
                courseCode, facultyId, room, isLab
        );
        Long id = jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        return id != null ? id : 0L;
    }

    public boolean updateTimetableSlot(long id, String section, String day, LocalTime start, LocalTime end,
                                       String courseCode, Integer facultyId, String room, boolean isLab) {
        int updated = jdbcTemplate.update(
                """
                UPDATE timetable
                SET section = ?, day = ?, start_time = ?, end_time = ?,
                    course_code = ?, faculty_id = ?, room = ?, is_lab = ?
                WHERE id = ?
                """,
                section, day, java.sql.Time.valueOf(start), java.sql.Time.valueOf(end),
                courseCode, facultyId, room, isLab, id
        );
        return updated > 0;
    }

    public boolean deleteTimetableSlot(long id) {
        return jdbcTemplate.update("DELETE FROM timetable WHERE id = ?", id) > 0;
    }

    public List<StatusLogRow> findStatusLogs(String search, String source, String fromDate, String toDate, int limit) {
        StringBuilder sql = new StringBuilder("""
                SELECT s.id, s.faculty_id, f.name AS faculty_name, s.available, s.source, s.created_at
                FROM status_log s
                JOIN faculty f ON s.faculty_id = f.id
                WHERE 1=1
                """);
        List<Object> params = new ArrayList<>();
        if (search != null && !search.isBlank()) {
            sql.append(" AND LOWER(f.name) LIKE ? ");
            params.add("%" + search.trim().toLowerCase() + "%");
        }
        if (source != null && !source.isBlank() && !"ALL".equalsIgnoreCase(source)) {
            sql.append(" AND s.source = ? ");
            params.add(source.trim().toUpperCase());
        }
        if (fromDate != null && !fromDate.isBlank()) {
            sql.append(" AND DATE(s.created_at) >= ? ");
            params.add(fromDate.trim());
        }
        if (toDate != null && !toDate.isBlank()) {
            sql.append(" AND DATE(s.created_at) <= ? ");
            params.add(toDate.trim());
        }
        sql.append(" ORDER BY s.created_at DESC, s.id DESC LIMIT ? ");
        params.add(limit);
        return jdbcTemplate.query(sql.toString(), STATUS_LOG_ROW_MAPPER, params.toArray());
    }

    @Transactional
    public void updateDeviceLabel(int facultyId, String label) {
        Optional<DeviceRow> existing = findDeviceByFacultyId(facultyId);
        if (existing.isEmpty()) {
            jdbcTemplate.update(
                    "INSERT INTO devices (faculty_id, online, device_label) VALUES (?, FALSE, ?)",
                    facultyId, label
            );
        } else {
            jdbcTemplate.update(
                    "UPDATE devices SET device_label = ? WHERE faculty_id = ?",
                    label, facultyId
            );
        }
    }

    public Optional<AdminUserRow> findAdminByUsername(String username) {
        List<AdminUserRow> rows = jdbcTemplate.query(
                "SELECT id, username, password_hash, must_change_password, failed_attempts, locked_until FROM admin_users WHERE username = ?",
                ADMIN_USER_MAPPER,
                username
        );
        return rows.isEmpty() ? Optional.empty() : Optional.of(rows.get(0));
    }

    public void createAdminUser(String username, String passwordHash, boolean mustChangePassword) {
        jdbcTemplate.update(
                "INSERT INTO admin_users (username, password_hash, must_change_password) VALUES (?, ?, ?)",
                username, passwordHash, mustChangePassword
        );
    }

    public void updateAdminLockState(int id, int failedAttempts, LocalDateTime lockedUntil) {
        jdbcTemplate.update(
                "UPDATE admin_users SET failed_attempts = ?, locked_until = ? WHERE id = ?",
                failedAttempts,
                lockedUntil != null ? Timestamp.valueOf(lockedUntil) : null,
                id
        );
    }

    public void updateAdminPassword(int id, String newPasswordHash) {
        jdbcTemplate.update(
                "UPDATE admin_users SET password_hash = ?, must_change_password = FALSE, failed_attempts = 0, locked_until = NULL WHERE id = ?",
                newPasswordHash, id
        );
    }
}
