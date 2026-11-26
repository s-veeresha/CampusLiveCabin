package com.vvce.cabin.model;

/**
 * Captures one incoming request to POST /api/faculty/{id}/status for diagnostics.
 */
public record RequestTraceDto(
        String time,
        int facultyId,
        Boolean available,
        String sourceIp,
        int httpStatus,
        String detail
) {
}
