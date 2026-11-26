-- Faculty Cabin Availability System
-- Vidyavardhaka College of Engineering (VVCE), Mysuru
-- Department of CSE (Artificial Intelligence & Machine Learning)

CREATE DATABASE IF NOT EXISTS cabin_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE cabin_db;

DROP TABLE IF EXISTS device_log;
DROP TABLE IF EXISTS devices;
DROP TABLE IF EXISTS admin_users;
DROP TABLE IF EXISTS status_log;
DROP TABLE IF EXISTS timetable;
DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS faculty;

CREATE TABLE faculty (
    id INT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    designation VARCHAR(80) NOT NULL,
    qualification VARCHAR(100) NOT NULL,
    college VARCHAR(150) NOT NULL DEFAULT 'Vidyavardhaka College of Engineering, Mysuru',
    department VARCHAR(100) NOT NULL DEFAULT 'CSE (AI & ML)',
    available BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE courses (
    code VARCHAR(20) PRIMARY KEY,
    name VARCHAR(150) NOT NULL
);

CREATE TABLE timetable (
    id INT AUTO_INCREMENT PRIMARY KEY,
    section ENUM('A', 'B', 'C', 'ALL') NOT NULL,
    day ENUM('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT') NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    course_code VARCHAR(20) NOT NULL,
    faculty_id INT NULL,
    room VARCHAR(30) NULL,
    is_lab BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT fk_timetable_course FOREIGN KEY (course_code) REFERENCES courses(code),
    CONSTRAINT fk_timetable_faculty FOREIGN KEY (faculty_id) REFERENCES faculty(id),
    UNIQUE KEY uk_timetable_faculty_slot (faculty_id, day, start_time),
    INDEX idx_timetable_faculty_day (faculty_id, day, start_time),
    INDEX idx_timetable_section_day (section, day, start_time)
);

CREATE TABLE status_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    faculty_id INT NOT NULL,
    available BOOLEAN NOT NULL,
    source ENUM('ESP32', 'TIMETABLE', 'ADMIN') NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_status_log_faculty FOREIGN KEY (faculty_id) REFERENCES faculty(id),
    INDEX idx_status_log_faculty_time (faculty_id, created_at DESC)
);

CREATE TABLE admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(80) NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE devices (
    faculty_id INT PRIMARY KEY,
    last_seen DATETIME NULL,
    ip VARCHAR(64) NULL,
    rssi INT NULL,
    online BOOLEAN NOT NULL DEFAULT FALSE,
    device_label VARCHAR(80) NULL,
    CONSTRAINT fk_devices_faculty FOREIGN KEY (faculty_id) REFERENCES faculty(id)
);

CREATE TABLE device_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    faculty_id INT NOT NULL,
    event ENUM('ONLINE', 'OFFLINE') NOT NULL,
    at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_device_log_faculty FOREIGN KEY (faculty_id) REFERENCES faculty(id),
    INDEX idx_device_log_at (at DESC),
    INDEX idx_device_log_faculty_at (faculty_id, at DESC)
);

-- Teaching Staff: Dept. of CSE (AI & ML), IDs 1..29 in exact order
INSERT INTO faculty (id, name, designation, qualification) VALUES
(1, 'Dr. Aditya C R', 'Professor & Head', 'B.E., M.Tech., Ph.D.'),
(2, 'Dr. C Balarengadurai', 'Professor', 'B.Tech, M.Tech., Ph.D.'),
(3, 'Dr. Prashanth M V', 'Professor', 'B.E., M.Tech., PhD.'),
(4, 'Dr. Vijay C P', 'Associate Professor', 'B.E, M.Tech. Ph.D.'),
(5, 'Dr. Varshitha D N', 'Associate Professor', 'B.E, M.Tech.Ph.D.'),
(6, 'Dr. C Manjunath', 'Associate Professor', 'B.E, M.Tech, Ph.D.'),
(7, 'Dr. Pramila R M', 'Associate Professor', 'B.Tech., M.Tech., Ph.D'),
(8, 'Shruthi B S', 'Sr. Assistant Professor', 'B.E., M.Tech., (Ph.D.)'),
(9, 'Manasa K B', 'Sr. Assistant Professor', 'B.E., M.Tech., (Ph.D.)'),
(10, 'Pooja N S', 'Sr. Assistant Professor', 'B.E., M.Tech., (Ph.D)'),
(11, 'Sumathi S K', 'Sr. Assistant Professor', 'B.E., M.Tech.'),
(12, 'Latha D U', 'Assistant Professor', 'B.E, M.Tech.'),
(13, 'Seema H R', 'Assistant Professor', 'B.E., M.Tech.'),
(14, 'Soumya G V', 'Assistant Professor', 'B.E., M.Tech.'),
(15, 'Anjali R', 'Assistant Professor', 'B.E., M.Tech.'),
(16, 'Dr. Sonali Nandish Manoli', 'Assistant Professor', 'B.E, M.Tech.Ph.D.'),
(17, 'Prashanth N', 'Assistant Professor', 'B.E., M.Tech.'),
(18, 'Harshith C', 'Assistant Professor', 'B.E., M.Tech. (Ph.D)'),
(19, 'Revathy B D', 'Assistant Professor', 'B.E., M.E.'),
(20, 'Nidhishree G', 'Assistant Professor', 'B.E., M.Tech.'),
(21, 'Harshith V', 'Assistant Professor', 'B.E., M.Tech.'),
(22, 'Indu J', 'Assistant Professor', 'B.E., M.Tech.'),
(23, 'Rashmi K', 'Assistant Professor', 'B.E., M.Tech.'),
(24, 'Vignesh T V', 'Assistant Professor', 'B.E., M.Tech.'),
(25, 'Gaurav P R', 'Assistant Professor', 'B.E., M.Tech.'),
(26, 'Rachana S', 'Assistant Professor', 'B.E., M.Tech.'),
(27, 'Mohan Kumar G', 'Assistant Professor', 'B.E., M.Tech.'),
(28, 'Shalini M S', 'Assistant Professor', 'B.E., M.Tech.'),
(29, 'Veena M S', 'Assistant Professor', 'B.E., M.Tech.');

-- 5th Semester Courses (Odd Sem 2026-27)
INSERT INTO courses (code, name) VALUES
('BMEEK501', 'Management and Engineering Economics'),
('BCICN502', 'Computer Networks'),
('BCIML503', 'Machine Learning'),
('BCIXX504', 'Cloud Computing / Cryptography & Network Security'),
('BCIML505', 'Machine Learning Laboratory'),
('BCIDL506', 'DevOps Laboratory'),
('BCIMP507', 'Mini Project'),
('BCIXX508', 'Open Elective-1'),
('BRIPK509', 'Research Methodology and IPR'),
('BIKSK501', 'Indian Knowledge System'),
('NSSPEYOGA', 'NSS / Physical Education / Yoga');

-- 5th Semester Timetable (Odd Sem 2026-27, Dated 04-09-2026 Version 1.0)
-- Section A (Default Room: M510)
INSERT INTO timetable (section, day, start_time, end_time, course_code, faculty_id, room, is_lab) VALUES
('A', 'MON', '09:00:00', '10:00:00', 'BCICN502', 4, 'M510', FALSE),
('A', 'MON', '10:00:00', '11:00:00', 'BMEEK501', 29, 'M510', FALSE),
('A', 'MON', '11:30:00', '12:30:00', 'BCIXX508', NULL, NULL, FALSE),
('A', 'MON', '12:30:00', '13:30:00', 'BIKSK501', 25, 'M510', FALSE),
('A', 'MON', '14:30:00', '16:30:00', 'BCIML505', 5, 'M308', TRUE),
('A', 'TUE', '10:00:00', '11:00:00', 'BCIXX508', NULL, NULL, FALSE),
('A', 'TUE', '11:30:00', '12:30:00', 'BCICN502', 4, 'M510', FALSE),
('A', 'TUE', '12:30:00', '13:30:00', 'BCIML503', 5, 'M510', FALSE),
('A', 'TUE', '14:30:00', '16:30:00', 'BCIDL506', 1, 'M309', TRUE),
('A', 'WED', '09:00:00', '10:00:00', 'BMEEK501', 29, 'M510', FALSE),
('A', 'WED', '10:00:00', '11:00:00', 'BCICN502', 4, 'M510', FALSE),
('A', 'WED', '12:30:00', '13:30:00', 'BCIXX508', NULL, NULL, FALSE),
('A', 'WED', '15:30:00', '16:30:00', 'BCICN502', 4, 'M510', FALSE),
('A', 'THU', '09:00:00', '11:00:00', 'BCIML505', 5, 'M308', TRUE),
('A', 'THU', '11:30:00', '12:30:00', 'BMEEK501', 29, 'M510', FALSE),
('A', 'THU', '12:30:00', '13:30:00', 'BCIML503', 5, 'M510', FALSE),
('A', 'FRI', '09:00:00', '10:00:00', 'BRIPK509', 2, 'M510', FALSE),
('A', 'FRI', '10:00:00', '11:00:00', 'BCIML503', 5, 'M510', FALSE),
('A', 'FRI', '11:30:00', '13:30:00', 'BCIDL506', 1, 'M309', TRUE),
('A', 'SAT', '14:30:00', '16:30:00', 'BCIMP507', NULL, 'M510', FALSE),
('A', 'SAT', '16:30:00', '18:30:00', 'NSSPEYOGA', NULL, NULL, FALSE);

-- Section B (Default Room: M511)
INSERT INTO timetable (section, day, start_time, end_time, course_code, faculty_id, room, is_lab) VALUES
('B', 'MON', '09:00:00', '10:00:00', 'BMEEK501', 25, 'M511', FALSE),
('B', 'MON', '10:00:00', '11:00:00', 'BCIML503', 7, 'M511', FALSE),
('B', 'MON', '11:30:00', '12:30:00', 'BCIXX508', NULL, NULL, FALSE),
('B', 'MON', '12:30:00', '13:30:00', 'BCICN502', 2, 'M511', FALSE),
('B', 'MON', '14:30:00', '16:30:00', 'BCIDL506', 4, 'M309', TRUE),
('B', 'TUE', '10:00:00', '11:00:00', 'BCIXX508', NULL, NULL, FALSE),
('B', 'TUE', '11:30:00', '12:30:00', 'BCICN502', 2, 'M511', FALSE),
('B', 'TUE', '12:30:00', '13:30:00', 'BRIPK509', 3, 'M511', FALSE),
('B', 'WED', '09:00:00', '11:00:00', 'BCIML505', 7, 'M309', TRUE),
('B', 'WED', '12:30:00', '13:30:00', 'BCIXX508', NULL, NULL, FALSE),
('B', 'WED', '14:30:00', '15:30:00', 'BCIML503', 7, 'M511', FALSE),
('B', 'WED', '15:30:00', '16:30:00', 'BCICN502', 2, 'M511', FALSE),
('B', 'THU', '09:00:00', '11:00:00', 'BCIDL506', 4, 'M309', TRUE),
('B', 'THU', '11:30:00', '12:30:00', 'BCICN502', 2, 'M511', FALSE),
('B', 'THU', '12:30:00', '13:30:00', 'BIKSK501', 16, 'M511', FALSE),
('B', 'THU', '15:30:00', '16:30:00', 'BMEEK501', 25, 'M511', FALSE),
('B', 'FRI', '09:00:00', '11:00:00', 'BCIML505', 7, 'M309', TRUE),
('B', 'FRI', '11:30:00', '12:30:00', 'BMEEK501', 25, 'M511', FALSE),
('B', 'FRI', '12:30:00', '13:30:00', 'BCIML503', 7, 'M511', FALSE),
('B', 'SAT', '14:30:00', '16:30:00', 'BCIMP507', NULL, 'M511', FALSE),
('B', 'SAT', '16:30:00', '18:30:00', 'NSSPEYOGA', NULL, NULL, FALSE);

-- Section C (Default Room: M509/M515)
INSERT INTO timetable (section, day, start_time, end_time, course_code, faculty_id, room, is_lab) VALUES
('C', 'MON', '09:00:00', '11:00:00', 'BCIDL506', 23, 'M309', TRUE),
('C', 'MON', '11:30:00', '12:30:00', 'BCIXX508', NULL, 'M509', FALSE),
('C', 'MON', '12:30:00', '13:30:00', 'BMEEK501', 26, 'M509', FALSE),
('C', 'MON', '14:30:00', '15:30:00', 'BCICN502', 11, 'M515', FALSE),
('C', 'MON', '15:30:00', '16:30:00', 'BRIPK509', 6, 'M515', FALSE),
('C', 'TUE', '10:00:00', '11:00:00', 'BCIXX508', NULL, NULL, FALSE),
('C', 'TUE', '11:30:00', '12:30:00', 'BMEEK501', 26, 'M509', FALSE),
('C', 'TUE', '12:30:00', '13:30:00', 'BCIML503', 12, 'M509', FALSE),
('C', 'TUE', '14:30:00', '15:30:00', 'BIKSK501', 25, 'M515', FALSE),
('C', 'TUE', '15:30:00', '16:30:00', 'BCICN502', 11, 'M515', FALSE),
('C', 'WED', '09:00:00', '11:00:00', 'BCIML505', 12, 'M308', TRUE),
('C', 'WED', '12:30:00', '13:30:00', 'BCIXX508', NULL, NULL, FALSE),
('C', 'THU', '09:00:00', '10:00:00', 'BCIML503', 12, 'M515', FALSE),
('C', 'THU', '10:00:00', '11:00:00', 'BCICN502', 11, 'M515', FALSE),
('C', 'THU', '11:30:00', '13:30:00', 'BCIDL506', 23, 'M309', TRUE),
('C', 'THU', '15:30:00', '16:30:00', 'BMEEK501', 26, 'M515', FALSE),
('C', 'FRI', '09:00:00', '10:00:00', 'BCICN502', 11, 'M515', FALSE),
('C', 'FRI', '10:00:00', '11:00:00', 'BCIML503', 12, 'M515', FALSE),
('C', 'SAT', '11:30:00', '13:30:00', 'BCIML505', 12, 'M308', TRUE),
('C', 'SAT', '14:30:00', '16:30:00', 'BCIMP507', NULL, 'M509/M515', FALSE),
('C', 'SAT', '16:30:00', '18:30:00', 'NSSPEYOGA', NULL, NULL, FALSE);

-- Parallel Split Elective BCIXX504 (section = 'ALL', de-duplicated by (faculty_id, day, start_time))
-- Note: PDF shows TUE 09:00 and WED 11:30 across A/B/C, WED 14:30 in Sec A, and THU 14:30 in Sec B & C.
INSERT INTO timetable (section, day, start_time, end_time, course_code, faculty_id, room, is_lab) VALUES
('ALL', 'TUE', '09:00:00', '10:00:00', 'BCIXX504', 28, 'M510', FALSE),
('ALL', 'TUE', '09:00:00', '10:00:00', 'BCIXX504', 21, 'M511', FALSE),
('ALL', 'TUE', '09:00:00', '10:00:00', 'BCIXX504', 18, 'M508', FALSE),
('ALL', 'WED', '11:30:00', '12:30:00', 'BCIXX504', 28, 'M510', FALSE),
('ALL', 'WED', '11:30:00', '12:30:00', 'BCIXX504', 21, 'M511', FALSE),
('ALL', 'WED', '11:30:00', '12:30:00', 'BCIXX504', 18, 'M508', FALSE),
('ALL', 'WED', '14:30:00', '15:30:00', 'BCIXX504', 28, 'M510', FALSE),
('ALL', 'WED', '14:30:00', '15:30:00', 'BCIXX504', 21, 'M511', FALSE),
('ALL', 'WED', '14:30:00', '15:30:00', 'BCIXX504', 18, 'M508', FALSE),
('ALL', 'THU', '14:30:00', '15:30:00', 'BCIXX504', 28, 'M510', FALSE),
('ALL', 'THU', '14:30:00', '15:30:00', 'BCIXX504', 21, 'M511', FALSE),
('ALL', 'THU', '14:30:00', '15:30:00', 'BCIXX504', 18, 'M508', FALSE);
