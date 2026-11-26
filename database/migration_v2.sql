-- Non-destructive migration v2 for Faculty Cabin Availability System
-- Preserves all existing faculty, courses, timetable, and status_log data.

USE cabin_db;

-- Allow ADMIN source in status_log alongside ESP32 and TIMETABLE
ALTER TABLE status_log
    MODIFY COLUMN source ENUM('ESP32', 'TIMETABLE', 'ADMIN') NOT NULL;

-- Admin authentication table (BCrypt password hash, forced password change, lockout tracking)
CREATE TABLE IF NOT EXISTS admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ESP32 connection monitoring table (one row per faculty cabin unit)
CREATE TABLE IF NOT EXISTS devices (
    faculty_id INT PRIMARY KEY,
    last_seen DATETIME NULL,
    ip VARCHAR(64) NULL,
    rssi INT NULL,
    online BOOLEAN NOT NULL DEFAULT FALSE,
    device_label VARCHAR(80) NULL,
    CONSTRAINT fk_devices_faculty FOREIGN KEY (faculty_id) REFERENCES faculty(id)
);

-- ESP32 online/offline transition log for notifications and device history
CREATE TABLE IF NOT EXISTS device_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    faculty_id INT NOT NULL,
    event ENUM('ONLINE', 'OFFLINE') NOT NULL,
    at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_device_log_faculty FOREIGN KEY (faculty_id) REFERENCES faculty(id),
    INDEX idx_device_log_at (at DESC),
    INDEX idx_device_log_faculty_at (faculty_id, at DESC)
);
