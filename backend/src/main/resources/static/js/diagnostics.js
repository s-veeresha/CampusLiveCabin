(() => {
    "use strict";

    const app = window.CabinApp;

    const dom = {
        themeBtn: document.getElementById("diag-theme-btn"),
        kpis: document.getElementById("diag-kpis"),
        lanUrls: document.getElementById("diag-lan-urls"),
        lastChange: document.getElementById("diag-last-change"),
        tbody: document.getElementById("diag-requests-tbody"),
        refreshBtn: document.getElementById("diag-refresh-btn")
    };

    function kpiCard(label, value, note, cls) {
        const card = document.createElement("article");
        card.className = `stat-card ${cls}`;
        card.innerHTML = `<div class="stat-label"></div><div class="stat-value"></div><div class="stat-note"></div>`;
        card.querySelector(".stat-label").textContent = label;
        card.querySelector(".stat-value").textContent = String(value);
        card.querySelector(".stat-note").textContent = note;
        return card;
    }

    async function loadDiagnostics() {
        try {
            const res = await fetch("/api/diagnostics");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            dom.kpis.innerHTML = "";
            dom.kpis.append(
                kpiCard("Backend", data.backendOk ? "OK" : "DOWN", "Spring Boot 0.0.0.0:8080", data.backendOk ? "stat-available" : "stat-unavailable"),
                kpiCard("Database", data.databaseOk ? "OK" : "ERROR", "MySQL cabin_db", data.databaseOk ? "stat-available" : "stat-unavailable"),
                kpiCard("SSE Clients", data.sseClientCount, "Active browser streams", "stat-inclass"),
                kpiCard("Server IST", app.formatIstTimestamp(data.serverTimeIst), "Asia/Kolkata clock", "stat-pct")
            );

            dom.lastChange.textContent = `Last status change: ${data.lastStatusChangeTime ? app.formatIstTimestamp(data.lastStatusChangeTime) : "None yet"}`;

            if (data.lanUrls && data.lanUrls.length) {
                dom.lanUrls.innerHTML = data.lanUrls.map((u) => `<code>${u}</code>`).join(" &nbsp;|&nbsp; ");
            } else {
                dom.lanUrls.textContent = "No non-loopback IPv4 interfaces detected.";
            }

            dom.tbody.innerHTML = "";
            if (!data.recentRequests || !data.recentRequests.length) {
                dom.tbody.innerHTML = `<tr><td colspan="6" style="text-align:center">No POST /api/faculty/{id}/status requests received since server start.</td></tr>`;
                return;
            }
            for (const req of data.recentRequests) {
                const tr = document.createElement("tr");
                tr.innerHTML = `<td></td><td></td><td></td><td></td><td><strong></strong></td><td></td>`;
                tr.children[0].textContent = app.formatIstTimestamp(req.time);
                tr.children[1].textContent = String(req.facultyId);
                tr.children[2].textContent = req.available === null ? "—" : String(req.available);
                tr.children[3].textContent = req.sourceIp || "—";
                const codeEl = tr.children[4].querySelector("strong");
                codeEl.textContent = String(req.httpStatus);
                codeEl.style.color = req.httpStatus >= 200 && req.httpStatus < 300 ? "var(--avail-text)" : "var(--unavail-text)";
                tr.children[5].textContent = req.detail || "";
                dom.tbody.appendChild(tr);
            }
        } catch (err) {
            dom.kpis.innerHTML = "";
            dom.kpis.append(kpiCard("Backend", "UNREACHABLE", err.message, "stat-unavailable"));
        }
    }

    function init() {
        app.applyTheme();
        dom.themeBtn.addEventListener("click", () => {
            const cur = app.resolveEffectiveTheme(app.state.settings.theme);
            app.state.settings.theme = cur === "dark" ? "light" : "dark";
            app.saveSettings();
            app.applyTheme();
        });
        dom.refreshBtn.addEventListener("click", loadDiagnostics);

        loadDiagnostics();
        window.setInterval(loadDiagnostics, 3000);

        const es = new EventSource("/api/stream");
        es.addEventListener("status", loadDiagnostics);
        es.addEventListener("device", loadDiagnostics);
    }

    init();
})();
