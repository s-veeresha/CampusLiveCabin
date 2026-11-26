(() => {
    "use strict";

    const app = window.CabinApp;

    const DESIGNATION_ORDER = [
        "Professor & Head",
        "Professor",
        "Associate Professor",
        "Sr. Assistant Professor",
        "Assistant Professor"
    ];

    const dom = {
        kpis: document.getElementById("dashboard-kpis"),
        ratioLabel: document.getElementById("dash-availability-ratio"),
        donutContainer: document.getElementById("dash-donut-container"),
        designationBars: document.getElementById("dash-designation-bars"),
        activityTimeline: document.getElementById("dash-activity-timeline"),
        devicesList: document.getElementById("dash-devices-list")
    };

    function createKpi(label, value, note, cls) {
        const card = document.createElement("article");
        card.className = `stat-card ${cls}`;
        card.innerHTML = `<div class="stat-label"></div><div class="stat-value"></div><div class="stat-note"></div>`;
        card.querySelector(".stat-label").textContent = label;
        card.querySelector(".stat-value").textContent = String(value);
        card.querySelector(".stat-note").textContent = note;
        return card;
    }

    function renderDonut(avail, unavail, total) {
        const pct = total > 0 ? Math.round((avail / total) * 100) : 0;
        dom.ratioLabel.textContent = `${avail} of ${total} (${pct}%)`;

        const radius = 58;
        const circumference = 2 * Math.PI * radius;
        const availArc = total > 0 ? (avail / total) * circumference : 0;
        const unavailArc = circumference - availArc;

        dom.donutContainer.innerHTML = `
            <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Availability donut chart: ${pct}% available">
                <circle cx="80" cy="80" r="${radius}" fill="none" stroke="var(--unavail-dot)" stroke-width="20"
                        stroke-dasharray="${unavailArc} ${circumference}"
                        transform="rotate(-90 80 80)" opacity="0.85"></circle>
                <circle cx="80" cy="80" r="${radius}" fill="none" stroke="var(--avail-dot)" stroke-width="20"
                        stroke-dasharray="${availArc} ${circumference}"
                        transform="rotate(-90 80 80)"></circle>
                <text x="80" y="76" text-anchor="middle" fill="var(--text-primary)" font-size="24" font-weight="800">${pct}%</text>
                <text x="80" y="96" text-anchor="middle" fill="var(--text-muted)" font-size="11" font-weight="700">AVAILABLE</text>
            </svg>
            <div class="donut-legend">
                <div class="donut-legend-row"><i class="dot" style="background:var(--avail-dot)"></i> Available: ${avail}</div>
                <div class="donut-legend-row"><i class="dot" style="background:var(--unavail-dot)"></i> Not available: ${unavail}</div>
            </div>
        `;
    }

    function renderDesignationBars(faculty) {
        dom.designationBars.innerHTML = "";
        for (const desig of DESIGNATION_ORDER) {
            const members = faculty.filter((f) => f.designation === desig);
            const total = members.length;
            const avail = members.filter((f) => f.available).length;
            const pct = total > 0 ? Math.round((avail / total) * 100) : 0;

            const row = document.createElement("div");
            row.innerHTML = `
                <div class="bar-row-label">
                    <span class="bar-name"></span>
                    <span class="bar-stat"></span>
                </div>
                <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
            `;
            row.querySelector(".bar-name").textContent = desig;
            row.querySelector(".bar-stat").textContent = `${avail}/${total} (${pct}%)`;
            dom.designationBars.appendChild(row);
        }
    }

    function renderActivityTimeline() {
        dom.activityTimeline.innerHTML = "";
        const events = app.state.notifications.slice(0, 20);
        if (!events.length) {
            dom.activityTimeline.innerHTML = `<div class="muted-text">No status or device activity recorded yet.</div>`;
            return;
        }

        for (const ev of events) {
            const item = document.createElement("div");
            item.className = "timeline-item";

            const left = document.createElement("div");
            left.textContent = ev.message;

            const right = document.createElement("div");
            right.className = "muted-text";
            right.textContent = `${app.timeAgo(ev.createdAt)} · ${ev.source}`;

            item.append(left, right);
            dom.activityTimeline.appendChild(item);
        }
    }

    function signalBarsHtml(signal) {
        const level = signal === "strong" ? 3 : signal === "ok" ? 2 : signal === "weak" ? 1 : 0;
        return `
            <span class="signal-bars sig-${signal}" title="Signal: ${signal}">
                <span class="${level >= 1 ? "on" : ""}"></span>
                <span class="${level >= 2 ? "on" : ""}"></span>
                <span class="${level >= 3 ? "on" : ""}"></span>
            </span>
        `;
    }

    function renderDevicesList(devices) {
        dom.devicesList.innerHTML = "";
        if (!devices.length) {
            dom.devicesList.innerHTML = `<div class="muted-text">No ESP32 units have checked in yet.</div>`;
            return;
        }

        for (const dev of devices) {
            const row = document.createElement("div");
            row.className = "device-row-item";

            const left = document.createElement("div");
            const nameLine = document.createElement("div");
            nameLine.style.fontWeight = "700";
            nameLine.textContent = `${dev.facultyName} (ID ${dev.facultyId})`;
            const metaLine = document.createElement("div");
            metaLine.className = "muted-text";
            metaLine.textContent = `IP: ${dev.ip || "--"} · RSSI: ${dev.rssi ?? "--"} dBm · ${app.timeAgo(dev.lastSeen)}`;
            left.append(nameLine, metaLine);

            const right = document.createElement("div");
            right.style.display = "flex";
            right.style.alignItems = "center";
            right.style.gap = "8px";
            right.innerHTML = `${signalBarsHtml(dev.signal)}<span class="device-dot ${dev.online ? "online" : "offline"}"></span><span>${dev.online ? "Online" : "Offline"}</span>`;

            row.append(left, right);
            dom.devicesList.appendChild(row);
        }
    }

    function render() {
        const faculty = app.state.faculty;
        const total = faculty.length;
        const avail = faculty.filter((f) => f.available).length;
        const unavail = total - avail;
        const inClass = faculty.filter((f) => f.currentClass !== null).length;
        const pct = total > 0 ? Math.round((avail / total) * 100) : 0;

        const devices = app.state.devices;
        const devOnline = devices.filter((d) => d.online).length;
        const devOffline = devices.length - devOnline;

        dom.kpis.innerHTML = "";
        dom.kpis.append(
            createKpi("Total Faculty", total, "CSE (AI & ML)", "stat-total"),
            createKpi("Available", avail, "Live ESP32 state", "stat-available"),
            createKpi("Not Available", unavail, "Away / Busy", "stat-unavailable"),
            createKpi("In Class Now", inClass, "Per IST timetable", "stat-inclass"),
            createKpi("Availability %", `${pct}%`, "Cabin presence rate", "stat-pct"),
            createKpi("Devices Online", devOnline, "Active heartbeats", "stat-available"),
            createKpi("Devices Offline", devOffline, "Silent > 90s", "stat-magenta")
        );

        renderDonut(avail, unavail, total);
        renderDesignationBars(faculty);
        renderActivityTimeline();
        renderDevicesList(devices);
    }

    app.dashboard = { render, signalBarsHtml };
})();
