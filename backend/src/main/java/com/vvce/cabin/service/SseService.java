package com.vvce.cabin.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.vvce.cabin.model.DeviceDto;
import com.vvce.cabin.model.FacultyDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages Server-Sent Events subscribers, status/device broadcasts, and 20s keep-alive pings.
 */
@Service
public class SseService {

    private static final Logger log = LoggerFactory.getLogger(SseService.class);

    private final Set<SseEmitter> emitters = ConcurrentHashMap.newKeySet();
    private final ObjectMapper objectMapper;

    public SseService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public int getClientCount() {
        return emitters.size();
    }

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(0L);
        emitters.add(emitter);

        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> {
            emitters.remove(emitter);
            emitter.complete();
        });
        emitter.onError(ex -> emitters.remove(emitter));

        try {
            emitter.send(SseEmitter.event()
                    .name("ping")
                    .data("connected", MediaType.TEXT_PLAIN));
        } catch (Exception ex) {
            emitters.remove(emitter);
            emitter.completeWithError(ex);
        }
        return emitter;
    }

    public void broadcastStatus(FacultyDto faculty) {
        broadcastJsonEvent("status", faculty);
    }

    public void broadcastDevice(DeviceDto device) {
        broadcastJsonEvent("device", device);
    }

    private void broadcastJsonEvent(String eventName, Object data) {
        if (emitters.isEmpty()) {
            return;
        }
        String payload;
        try {
            payload = objectMapper.writeValueAsString(data);
        } catch (JsonProcessingException ex) {
            log.error("Failed to serialize SSE {} payload", eventName, ex);
            return;
        }

        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                        .name(eventName)
                        .data(payload, MediaType.APPLICATION_JSON));
            } catch (Exception ex) {
                emitters.remove(emitter);
                safeComplete(emitter);
            }
        }
    }

    /**
     * Sends a 20-second keep-alive ping and prunes disconnected emitters.
     */
    @Scheduled(fixedRate = 20000)
    public void sendKeepAlivePing() {
        if (emitters.isEmpty()) {
            return;
        }
        String ts = ZonedDateTime.now(TimetableService.IST).format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        String payload;
        try {
            payload = objectMapper.writeValueAsString(Map.of("ts", ts));
        } catch (JsonProcessingException ex) {
            payload = "{}";
        }

        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                        .name("ping")
                        .data(payload, MediaType.APPLICATION_JSON));
            } catch (Exception ex) {
                emitters.remove(emitter);
                safeComplete(emitter);
            }
        }
    }

    private void safeComplete(SseEmitter emitter) {
        try {
            emitter.complete();
        } catch (Exception ignored) {
            // Emitter is already closed or completed.
        }
    }
}
