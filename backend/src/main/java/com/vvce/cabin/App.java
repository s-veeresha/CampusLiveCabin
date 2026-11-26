package com.vvce.cabin;

import com.vvce.cabin.service.DiagnosticsService;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.util.List;
import java.util.TimeZone;

/**
 * Entry point for the VVCE CSE (AI & ML) Faculty Cabin Availability backend.
 */
@SpringBootApplication
@EnableScheduling
public class App {

    private static final Logger log = LoggerFactory.getLogger(App.class);

    private final DiagnosticsService diagnosticsService;

    @Value("${server.port:8080}")
    private int serverPort;

    public App(DiagnosticsService diagnosticsService) {
        this.diagnosticsService = diagnosticsService;
    }

    public static void main(String[] args) {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        SpringApplication.run(App.class, args);
    }

    @PostConstruct
    public void initTimeZone() {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
    }

    @EventListener(ApplicationReadyEvent.class)
    public void logLanAddressesOnStartup() {
        List<String> lanUrls = diagnosticsService.discoverLanUrls(serverPort);
        if (lanUrls.isEmpty()) {
            log.info("ESP32 SERVER should be one of: http://localhost:{}", serverPort);
        } else {
            log.info("ESP32 SERVER should be one of: {}", String.join(" | ", lanUrls));
        }
    }
}
