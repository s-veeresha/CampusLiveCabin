package com.vvce.cabin.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.vvce.cabin.service.DiagnosticsService;
import com.vvce.cabin.service.TimetableService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Validates X-API-KEY before request-body parsing on ESP32 hardware endpoints.
 */
@Component
public class ApiKeyInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(ApiKeyInterceptor.class);
    private static final Pattern STATUS_ID_PATTERN = Pattern.compile("^/api/faculty/(\\d+)/status$");

    private final String expectedApiKey;
    private final DiagnosticsService diagnosticsService;
    private final ObjectMapper objectMapper;

    public ApiKeyInterceptor(@Value("${app.api-key}") String expectedApiKey,
                             DiagnosticsService diagnosticsService,
                             ObjectMapper objectMapper) {
        this.expectedApiKey = expectedApiKey;
        this.diagnosticsService = diagnosticsService;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        if (!"POST".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String providedKey = request.getHeader("X-API-KEY");
        if (isValidApiKey(providedKey)) {
            return true;
        }

        String clientIp = extractClientIp(request);
        String uri = request.getRequestURI();
        Matcher m = STATUS_ID_PATTERN.matcher(uri);
        if (m.matches()) {
            int facultyId = Integer.parseInt(m.group(1));
            diagnosticsService.recordStatusRequest(facultyId, null, clientIp, 401, "Invalid or missing X-API-KEY");
            log.warn("[STATUS-POST] 401 Unauthorized from={} uri={}", clientIp, uri);
        }

        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write(objectMapper.writeValueAsString(Map.of(
                "status", 401,
                "error", "Invalid or missing X-API-KEY header",
                "timestamp", ZonedDateTime.now(TimetableService.IST).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME)
        )));
        return false;
    }

    public static String extractClientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    private boolean isValidApiKey(String providedKey) {
        if (providedKey == null || expectedApiKey == null) {
            return false;
        }
        return MessageDigest.isEqual(
                providedKey.getBytes(StandardCharsets.UTF_8),
                expectedApiKey.getBytes(StandardCharsets.UTF_8)
        );
    }
}
