package com.vvce.cabin.model;

import java.util.List;

/**
 * Live backend health, SSE client count, and recent status request diagnostics.
 */
public record DiagnosticsDto(
        boolean backendOk,
        boolean databaseOk,
        String serverTimeIst,
        int sseClientCount,
        String lastStatusChangeTime,
        List<String> lanUrls,
        List<RequestTraceDto> recentRequests
) {
}
