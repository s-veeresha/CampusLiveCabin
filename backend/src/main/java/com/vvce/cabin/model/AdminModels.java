package com.vvce.cabin.model;

/**
 * Request and response DTOs for the Admin API (/api/admin/**).
 */
public final class AdminModels {

    private AdminModels() {
    }

    public record LoginRequest(String username, String password) {
    }

    public record LoginResponse(
            boolean authenticated,
            String username,
            boolean mustChangePassword,
            String expiresAt
    ) {
    }

    public record ChangePasswordRequest(String currentPassword, String newPassword) {
    }

    public record FacultyRequest(
            String name,
            String designation,
            String qualification,
            String department
    ) {
    }

    public record TimetableSlotRequest(
            String section,
            String day,
            String startTime,
            String endTime,
            String courseCode,
            Integer facultyId,
            String room,
            Boolean isLab
    ) {
    }

    public record DeviceLabelRequest(String deviceLabel) {
    }

    public record CourseDto(String code, String name) {
    }

    public record StatusLogDto(
            long id,
            int facultyId,
            String facultyName,
            boolean available,
            String source,
            String createdAt
    ) {
    }

    public record AdminSlotDto(
            long id,
            String section,
            String day,
            String startTime,
            String endTime,
            String courseCode,
            String courseName,
            Integer facultyId,
            String facultyName,
            String room,
            boolean isLab
    ) {
    }
}
