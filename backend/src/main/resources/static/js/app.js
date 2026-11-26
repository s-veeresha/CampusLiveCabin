(() => {
    "use strict";

    const app = window.CabinApp;

    const dom = {
        istClock: document.getElementById("ist-clock"),
        liveIndicator: document.getElementById("live-indicator"),
        liveText: document.getElementById("live-text"),
        reconnectBanner: document.getElementById("reconnect-banner"),
        manualReconnectBtn: document.getElementById("manual-reconnect-btn"),
        footerSyncTime: document.getElementById("footer-sync-time"),
        esp32Wrap: document.getElementById("esp32-wrap"),
        esp32Btn: document.getElementById("esp32-pill-btn"),
        esp32Text: document.getElementById("esp32-pill-text"),
        esp32Dropdown: document.getElementById("esp32-dropdown"),
        esp32Summary: document.getElementById("esp32-dropdown-summary"),
        esp32List: document.getElementById("esp32-dropdown-list"),
        tabBtns: Array.from(document.querySelectorAll(".tab-btn")),
        tabPanels: {
            directory: document.getElementById("view-directory"),
            dashboard: document.getElementById("view-dashboard"),
            timetable: document.getElementById("view-timetable")
        }
    };

    function updateIstClock() {
        const now = new Date();
        const use24 = app.state.settings.timeFormat === "24h";
        dom.istClock.textContent = now.toLocaleTimeString("en-IN", {
            timeZone: "Asia/Kolkata",
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: !use24
        }) + " IST";
    }

    function updateEsp32Header() {
        const devices = app.state.devices;
        const onlineCount = devices.filter((d) => d.online).length;
        const total = devices.length;

        dom.esp32Btn.classList.remove("esp32-online", "esp32-offline");
        if (total === 0) {
            dom.esp32Btn.classList.add("esp32-offline");
            dom.esp32Text.textContent = "ESP32 offline";
            dom.esp32Summary.textContent = "0 devices";
        } else if (total === 1) {
            dom.esp32Btn.classList.add(onlineCount === 1 ? "esp32-online" : "esp32-offline");
            dom.esp32Text.textContent = onlineCount === 1 ? "ESP32 connected" : "ESP32 offline";
            dom.esp32Summary.textContent = `${onlineCount} of 1 online`;
        } else {
            dom.esp32Btn.classList.add(onlineCount > 0 ? "esp32-online" : "esp32-offline");
            dom.esp32Text.textContent = `${onlineCount} of ${total} ESP32 online`;
            dom.esp32Summary.textContent = `${onlineCount} of ${total} online`;
        }

        dom.esp32List.innerHTML = "";
        if (!total) {
            dom.esp32List.innerHTML = `<div class="dropdown-empty">No ESP32 devices have reported yet.</div>`;
            return;
        }
        for (const dev of devices) {
            const item = document.createElement("div");
            item.className = "dropdown-item";
            const top = document.createElement("div");
            top.style.display = "flex";
            top.style.justifyContent = "space-between";
            top.style.fontWeight = "700";
            top.innerHTML = `<span></span><span></span>`;
            top.children[0].textContent = `${dev.facultyName} (#${dev.facultyId})`;
            top.children[1].textContent = dev.online ? "Online" : "Offline";
            top.children[1].style.color = dev.online ? "var(--avail-text)" : "var(--text-muted)";

            const meta = document.createElement("div");
            meta.className = "dropdown-item-meta";
            meta.textContent = `IP: ${dev.ip || "--"} · Signal: ${dev.signal} (${dev.rssi ?? "--"} dBm) · Seen: ${app.timeAgo(dev.lastSeen)}`;
            item.append(top, meta);
            dom.esp32List.appendChild(item);
        }
    }

    function setConnectionStatus(connected, label) {
        app.state.sseConnected = connected;
        dom.liveIndicator.classList.remove("live-connected", "live-reconnecting", "live-connecting");
        dom.liveIndicator.classList.add(connected ? "live-connected" : "live-reconnecting");
        dom.liveText.textContent = label;
        dom.reconnectBanner.hidden = connected;
    }

    function updateFooterSync() {
        const now = new Date();
        dom.footerSyncTime.textContent = `Last data sync: ${app.formatIstTimestamp(now.toISOString())}`;
    }

    async function loadAllData() {
        try {
            const [facRes, devRes] = await Promise.all([
                fetch("/api/faculty"),
                fetch("/api/devices")
            ]);
            if (facRes.ok) {
                app.state.faculty = await facRes.json();
            }
            if (devRes.ok) {
                app.state.devices = await devRes.json();
            }
            app.directory.render();
            app.dashboard.render();
            updateEsp32Header();
            updateFooterSync();
            if (app.state.openFacultyId !== null) {
                const openFac = app.state.faculty.find((f) => f.id === app.state.openFacultyId);
                if (openFac) app.directory.updateModalHeader(openFac);
            }
        } catch {
            // Keep stale data visible until next sync.
        }
    }

    function applyStatusUpdate(updatedFaculty) {
        const idx = app.state.faculty.findIndex((f) => f.id === updatedFaculty.id);
        const prevAvailable = idx >= 0 ? app.state.faculty[idx].available : null;
        if (idx >= 0) {
            app.state.faculty[idx] = updatedFaculty;
        } else {
            app.state.faculty.push(updatedFaculty);
        }
        if (updatedFaculty.device) {
            upsertDeviceInState(updatedFaculty.device);
        }
        app.directory.render(updatedFaculty.id);
        app.dashboard.render();
        updateEsp32Header();
        updateFooterSync();
        if (app.state.openFacultyId === updatedFaculty.id) {
            app.directory.updateModalHeader(updatedFaculty);
        }
        app.notifications.handleLiveStatusEvent(updatedFaculty, prevAvailable);
    }

    function upsertDeviceInState(device) {
        const dIdx = app.state.devices.findIndex((d) => d.facultyId === device.facultyId);
        if (dIdx >= 0) {
            app.state.devices[dIdx] = device;
        } else {
            app.state.devices.push(device);
            app.state.devices.sort((a, b) => a.facultyId - b.facultyId);
        }
        const fIdx = app.state.faculty.findIndex((f) => f.id === device.facultyId);
        if (fIdx >= 0) {
            app.state.faculty[fIdx] = { ...app.state.faculty[fIdx], device };
        }
    }

    function applyDeviceUpdate(device) {
        upsertDeviceInState(device);
        updateEsp32Header();
        app.directory.render();
        app.dashboard.render();
        updateFooterSync();
        if (app.state.openFacultyId === device.facultyId) {
            const openFac = app.state.faculty.find((f) => f.id === device.facultyId);
            if (openFac) app.directory.updateModalHeader(openFac);
        }
        app.notifications.handleLiveDeviceEvent(device);
    }

    function scheduleReconnect() {
        if (app.state.reconnectTimer) return;
        setConnectionStatus(false, "Reconnecting...");
        const delay = app.state.reconnectDelayMs;
        app.state.reconnectDelayMs = Math.min(delay * 2, 10000);
        app.state.reconnectTimer = window.setTimeout(() => {
            app.state.reconnectTimer = null;
            connectSse(true);
        }, delay);
    }

    function connectSse(isReconnect = false) {
        if (app.state.eventSource) {
            app.state.eventSource.close();
            app.state.eventSource = null;
        }
        const es = new EventSource("/api/stream");
        app.state.eventSource = es;

        es.onopen = () => {
            app.state.reconnectDelayMs = 1000;
            app.state.lastSseActivityAt = Date.now();
            setConnectionStatus(true, "Live");
            if (isReconnect) {
                loadAllData();
                app.notifications.loadNotifications();
            }
        };

        es.addEventListener("ping", () => {
            app.state.lastSseActivityAt = Date.now();
            setConnectionStatus(true, "Live");
        });

        es.addEventListener("status", (event) => {
            app.state.lastSseActivityAt = Date.now();
            setConnectionStatus(true, "Live");
            try {
                applyStatusUpdate(JSON.parse(event.data));
            } catch (err) {
                console.error("SSE status parse error", err);
            }
        });

        es.addEventListener("device", (event) => {
            app.state.lastSseActivityAt = Date.now();
            setConnectionStatus(true, "Live");
            try {
                applyDeviceUpdate(JSON.parse(event.data));
            } catch (err) {
                console.error("SSE device parse error", err);
            }
        });

        es.onerror = () => {
            setConnectionStatus(false, "Reconnecting...");
            if (es.readyState === EventSource.CLOSED) {
                scheduleReconnect();
            }
        };
    }

    function switchTab(tabName) {
        app.state.activeTab = tabName;
        dom.tabBtns.forEach((btn) => {
            const active = btn.dataset.tab === tabName;
            btn.classList.toggle("active", active);
            btn.setAttribute("aria-selected", String(active));
        });
        Object.entries(dom.tabPanels).forEach(([key, panel]) => {
            panel.hidden = key !== tabName;
        });
        if (tabName === "dashboard") app.dashboard.render();
        if (tabName === "timetable") app.timetable.render();
    }

    function init() {
        app.settings.init();
        app.notifications.init();
        app.directory.init();
        app.timetable.init();

        dom.tabBtns.forEach((btn) => {
            btn.addEventListener("click", () => switchTab(btn.dataset.tab));
        });

        dom.esp32Btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const open = dom.esp32Dropdown.hidden;
            dom.esp32Dropdown.hidden = !open;
            dom.esp32Btn.setAttribute("aria-expanded", String(open));
        });

        document.addEventListener("click", (e) => {
            if (!dom.esp32Dropdown.hidden && !dom.esp32Wrap.contains(e.target)) {
                dom.esp32Dropdown.hidden = true;
                dom.esp32Btn.setAttribute("aria-expanded", "false");
            }
        });

        dom.manualReconnectBtn.addEventListener("click", () => connectSse(true));

        updateIstClock();
        window.setInterval(updateIstClock, 1000);
        window.setInterval(loadAllData, 60000);
        window.setInterval(() => {
            if (app.state.lastSseActivityAt && Date.now() - app.state.lastSseActivityAt > 50000) {
                connectSse(true);
            }
        }, 15000);

        loadAllData();
        app.notifications.loadNotifications();
        connectSse(false);
    }

    app.switchTab = switchTab;
    app.reloadAll = loadAllData;
    init();
})();
