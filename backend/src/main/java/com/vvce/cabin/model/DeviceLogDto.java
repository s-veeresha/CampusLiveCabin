package com.vvce.cabin.model;

/**
 * Online/offline transition event recorded in device_log.
 */
public record DeviceLogDto(
        long id,
        int facultyId,
        String facultyName,
        String event,
        String at
) {
}
