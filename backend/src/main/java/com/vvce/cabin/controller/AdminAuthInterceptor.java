package com.vvce.cabin.controller;

import com.vvce.cabin.repository.CabinRepository.AdminUserRow;
import com.vvce.cabin.service.AdminAuthService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * Protects all /api/admin/** endpoints (except login/logout) via HttpOnly cookie or Bearer token.
 */
@Component
public class AdminAuthInterceptor implements HandlerInterceptor {

    public static final String ADMIN_COOKIE_NAME = "VVCE_ADMIN_TOKEN";
    public static final String ATTR_ADMIN_USER = "vvce.admin.user";

    private final AdminAuthService authService;

    public AdminAuthInterceptor(AdminAuthService authService) {
        this.authService = authService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String uri = request.getRequestURI();
        if ("/api/admin/login".equals(uri) || "/api/admin/logout".equals(uri)) {
            return true;
        }

        String token = extractToken(request);
        boolean allowPendingChange = "/api/admin/me".equals(uri) || "/api/admin/change-password".equals(uri);
        AdminUserRow admin = authService.requireValidAdmin(token, allowPendingChange);
        request.setAttribute(ATTR_ADMIN_USER, admin);
        return true;
    }

    private String extractToken(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7).trim();
        }
        Cookie[] cookies = request.getCookies();
        if (cookies != null) {
            for (Cookie cookie : cookies) {
                if (ADMIN_COOKIE_NAME.equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        return null;
    }
}
