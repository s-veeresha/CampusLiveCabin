package com.vvce.cabin.model;

/**
 * Request body for POST /api/faculty/{id}/status.
 */
public record StatusUpdateRequest(Boolean available) {
}
