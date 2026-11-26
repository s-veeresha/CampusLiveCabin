package com.vvce.cabin.controller;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Registers API key protection on ESP32 endpoints and HMAC session auth on /api/admin/**.
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final ApiKeyInterceptor apiKeyInterceptor;
    private final AdminAuthInterceptor adminAuthInterceptor;

    public WebMvcConfig(ApiKeyInterceptor apiKeyInterceptor,
                        AdminAuthInterceptor adminAuthInterceptor) {
        this.apiKeyInterceptor = apiKeyInterceptor;
        this.adminAuthInterceptor = adminAuthInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(apiKeyInterceptor)
                .addPathPatterns("/api/faculty/*/status", "/api/devices/*/heartbeat");
        registry.addInterceptor(adminAuthInterceptor)
                .addPathPatterns("/api/admin/**");
    }
}
