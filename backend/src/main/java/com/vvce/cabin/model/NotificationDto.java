package com.vvce.cabin.model;

/**
 * Unified notification event constructed from status_log and device_log.
 */
public record NotificationDto(
        String id,
        String type,
        int facultyId,
        String facultyName,
        Boolean available,
        String source,
        String deviceEvent,
        String message,
        String createdAt
) {
}
