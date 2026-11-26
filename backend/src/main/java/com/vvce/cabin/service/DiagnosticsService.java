package com.vvce.cabin.service;

import com.vvce.cabin.model.RequestTraceDto;
import org.springframework.stereotype.Service;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Deque;
import java.util.List;

/**
 * Maintains the last 10 incoming status POST requests and discovers LAN IPv4 addresses.
 */
@Service
public class DiagnosticsService {

    private static final int MAX_RECENT_REQUESTS = 10;

    private final Deque<RequestTraceDto> recentRequests = new ArrayDeque<>(MAX_RECENT_REQUESTS);
    private volatile String lastStatusChangeTime;

    public synchronized void recordStatusRequest(int facultyId,
                                                 Boolean available,
                                                 String sourceIp,
                                                 int httpStatus,
                                                 String detail) {
        String nowIso = ZonedDateTime.now(TimetableService.IST)
                .format(DateTimeFormatter.ISO_OFFSET_DATE_TIME);
        if (httpStatus >= 200 && httpStatus < 300) {
            lastStatusChangeTime = nowIso;
        }
        if (recentRequests.size() >= MAX_RECENT_REQUESTS) {
            recentRequests.removeLast();
        }
        recentRequests.addFirst(new RequestTraceDto(nowIso, facultyId, available, sourceIp, httpStatus, detail));
    }

    public synchronized List<RequestTraceDto> getRecentRequests() {
        return new ArrayList<>(recentRequests);
    }

    public String getLastStatusChangeTime() {
        return lastStatusChangeTime;
    }

    public void setLastStatusChangeTimeIfEmpty(String isoTime) {
        if (this.lastStatusChangeTime == null && isoTime != null) {
            this.lastStatusChangeTime = isoTime;
        }
    }

    /**
     * Lists non-loopback site-local / LAN IPv4 URLs for ESP32 configuration.
     */
    public List<String> discoverLanUrls(int port) {
        List<String> urls = new ArrayList<>();
        try {
            for (NetworkInterface nif : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!nif.isUp() || nif.isLoopback() || nif.isVirtual()) {
                    continue;
                }
                for (InetAddress addr : Collections.list(nif.getInetAddresses())) {
                    if (addr instanceof Inet4Address && !addr.isLoopbackAddress() && !addr.isLinkLocalAddress()) {
                        urls.add("http://" + addr.getHostAddress() + ":" + port);
                    }
                }
            }
        } catch (Exception ignored) {
            // Fall back to empty list if interface enumeration fails.
        }
        return urls;
    }
}
