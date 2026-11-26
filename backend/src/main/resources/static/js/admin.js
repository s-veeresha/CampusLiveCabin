(() => {
    "use strict";

    const app = window.CabinApp;

    const adminState = {
        faculty: [],
        courses: [],
        slots: [],
        devices: [],
        deviceLogs: []
    };

    const dom = {
        themeBtn: document.getElementById("admin-theme-btn"),
        logoutBtn: document.getElementById("admin-logout-btn"),
        tabsBar: document.getElementById("admin-tabs-bar"),
        tabBtns: Array.from(document.querySelectorAll("[data-admin-tab]")),
        loginSec: document.getElementById("admin-login-section"),
        loginForm: document.getElementById("admin-login-form"),
        loginUser: document.getElementById("login-username"),
        loginPass: document.getElementById("login-password"),
        loginErr: document.getElementById("login-error"),
        forcePwSec: document.getElementById("admin-force-pw-section"),
        forcePwForm: document.getElementById("force-pw-form"),
        forcePwErr: document.getElementById("force-pw-error"),
        consoleSec: document.getElementById("admin-console"),
        toast: document.getElementById("admin-toast"),
        err: document.getElementById("admin-error"),
        facForm: document.getElementById("admin-faculty-form"),
        facFormTitle: document.getElementById("fac-form-title"),
        facResetBtn: document.getElementById("fac-reset-btn"),
        facEditId: document.getElementById("fac-edit-id"),
        facName: document.getElementById("fac-name"),
        facDesig: document.getElementById("fac-designation"),
        facQual: document.getElementById("fac-qualification"),
        facDept: document.getElementById("fac-department"),
        facTbody: document.getElementById("admin-faculty-tbody"),
        slotForm: document.getElementById("admin-slot-form"),
        slotFormTitle: document.getElementById("slot-form-title"),
        slotResetBtn: document.getElementById("slot-reset-btn"),
        slotEditId: document.getElementById("slot-edit-id"),
        slotSection: document.getElementById("slot-section"),
        slotDay: document.getElementById("slot-day"),
        slotStart: document.getElementById("slot-start"),
        slotEnd: document.getElementById("slot-end"),
        slotCourse: document.getElementById("slot-course"),
        slotFaculty: document.getElementById("slot-faculty"),
        slotRoom: document.getElementById("slot-room"),
        slotIsLab: document.getElementById("slot-islab"),
        slotFilterSec: document.getElementById("slot-filter-section"),
        slotsTbody: document.getElementById("admin-slots-tbody"),
        logsForm: document.getElementById("logs-filter-form"),
        logsSearch: document.getElementById("logs-search"),
        logsSource: document.getElementById("logs-source"),
        logsFrom: document.getElementById("logs-from"),
        logsTo: document.getElementById("logs-to"),
        logsExportBtn: document.getElementById("logs-export-btn"),
        logsTbody: document.getElementById("admin-logs-tbody"),
        devicesTbody: document.getElementById("admin-devices-tbody"),
        deviceLogsTbody: document.getElementById("admin-device-logs-tbody"),
        pwForm: document.getElementById("admin-pw-form")
    };

    function showNotice(msg, isError = false) {
        dom.toast.hidden = isError;
        dom.err.hidden = !isError;
        (isError ? dom.err : dom.toast).textContent = msg;
    }

    async function apiFetch(url, options = {}) {
        const res = await fetch(url, {
            credentials: "same-origin",
            headers: { "Content-Type": "application/json", ...(options.headers || {}) },
            ...options
        });
        if (res.status === 401) {
            showLogin();
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || "Session expired. Please sign in.");
        }
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `Request failed (${res.status})`);
        }
        return res.json();
    }

    function showLogin() {
        dom.loginSec.hidden = false;
        dom.forcePwSec.hidden = true;
        dom.consoleSec.hidden = true;
        dom.tabsBar.hidden = true;
        dom.logoutBtn.hidden = true;
    }

    function showForcePasswordChange() {
        dom.loginSec.hidden = true;
        dom.forcePwSec.hidden = false;
        dom.consoleSec.hidden = true;
        dom.tabsBar.hidden = true;
        dom.logoutBtn.hidden = false;
    }

    function showConsole() {
        dom.loginSec.hidden = true;
        dom.forcePwSec.hidden = true;
        dom.consoleSec.hidden = false;
        dom.tabsBar.hidden = false;
        dom.logoutBtn.hidden = false;
        loadAllAdminData();
    }

    async function checkSession() {
        try {
            const res = await fetch("/api/admin/me", { credentials: "same-origin" });
            if (!res.ok) {
                showLogin();
                return;
            }
            const me = await res.json();
            if (me.mustChangePassword) {
                showForcePasswordChange();
            } else {
                showConsole();
            }
        } catch {
            showLogin();
        }
    }

    async function loadAllAdminData() {
        try {
            const [faculty, courses, slots, devices, deviceLogs] = await Promise.all([
                apiFetch("/api/admin/faculty"),
                apiFetch("/api/admin/courses"),
                apiFetch("/api/admin/timetable"),
                apiFetch("/api/admin/devices"),
                apiFetch("/api/admin/devices/logs?limit=100")
            ]);
            adminState.faculty = faculty;
            adminState.courses = courses;
            adminState.slots = slots;
            adminState.devices = devices;
            adminState.deviceLogs = deviceLogs;

            renderFacultyTable();
            populateSlotSelects();
            renderSlotsTable();
            renderDevicesTable();
            renderDeviceLogsTable();
            await loadLogs();
        } catch (err) {
            showNotice(err.message, true);
        }
    }

    function renderFacultyTable() {
        dom.facTbody.innerHTML = "";
        for (const f of adminState.faculty) {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td></td><td><strong></strong></td><td></td><td></td>
                <td><span class="status-badge"></span></td>
                <td class="admin-btn-cell"></td>
                <td class="admin-btn-cell"></td>
            `;
            const cabin = f.cabinNumber || `Cabin-${String(f.id).padStart(2, "0")}`;
            tr.children[0].innerHTML = `<span>${f.id}</span> <span class="cabin-badge" style="font-size:0.7rem;margin-left:4px">${cabin}</span>`;
            tr.children[1].querySelector("strong").textContent = f.name;
            tr.children[2].textContent = f.designation;
            tr.children[3].textContent = f.qualification;

            const badge = tr.children[4].querySelector(".status-badge");
            badge.className = `status-badge ${f.available ? "is-available" : "is-unavailable"}`;
            badge.textContent = f.available ? "Available" : "Not available";

            const overrideCell = tr.children[5];
            const btnAvail = document.createElement("button");
            btnAvail.type = "button";
            btnAvail.className = "btn-sm";
            btnAvail.textContent = f.available ? "Set Busy" : "Set Available";
            btnAvail.addEventListener("click", async () => {
                try {
                    await apiFetch(`/api/admin/faculty/${f.id}/status`, {
                        method: "POST",
                        body: JSON.stringify({ available: !f.available })
                    });
                    showNotice(`Updated ${f.name} (source: ADMIN)`);
                    loadAllAdminData();
                } catch (e) {
                    showNotice(e.message, true);
                }
            });
            overrideCell.appendChild(btnAvail);

            const actCell = tr.children[6];
            const editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.className = "btn-sm";
            editBtn.textContent = "Edit";
            editBtn.addEventListener("click", () => {
                dom.facEditId.value = String(f.id);
                dom.facName.value = f.name;
                dom.facDesig.value = f.designation;
                dom.facQual.value = f.qualification;
                dom.facDept.value = f.department;
                dom.facFormTitle.textContent = `Edit Faculty #${f.id}`;
                dom.facResetBtn.hidden = false;
            });

            const delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "btn-sm btn-danger";
            delBtn.textContent = "Delete";
            delBtn.addEventListener("click", async () => {
                if (!window.confirm(`Delete ${f.name}?`)) return;
                try {
                    await apiFetch(`/api/admin/faculty/${f.id}`, { method: "DELETE" });
                    showNotice(`Deleted ${f.name}`);
                    loadAllAdminData();
                } catch (e) {
                    showNotice(e.message, true);
                }
            });
            actCell.append(editBtn, delBtn);
            dom.facTbody.appendChild(tr);
        }
    }

    function populateSlotSelects() {
        dom.slotCourse.innerHTML = "";
        for (const c of adminState.courses) {
            const opt = document.createElement("option");
            opt.value = c.code;
            opt.textContent = `${c.code} - ${c.name}`;
            dom.slotCourse.appendChild(opt);
        }

        dom.slotFaculty.innerHTML = `<option value="">Unassigned (NULL)</option>`;
        for (const f of adminState.faculty) {
            const opt = document.createElement("option");
            opt.value = String(f.id);
            opt.textContent = `${f.id}. ${f.name}`;
            dom.slotFaculty.appendChild(opt);
        }
    }

    function renderSlotsTable() {
        const filterSec = dom.slotFilterSec.value;
        const rows = filterSec
            ? adminState.slots.filter((s) => s.section === filterSec)
            : adminState.slots;

        dom.slotsTbody.innerHTML = "";
        for (const s of rows) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td><td></td><td></td><td class="admin-btn-cell"></td>`;
            tr.children[0].textContent = s.section;
            tr.children[1].textContent = s.day;
            tr.children[2].textContent = `${s.startTime} - ${s.endTime}`;
            tr.children[3].textContent = `${s.courseCode} (${s.courseName})`;
            tr.children[4].textContent = s.facultyName || "—";
            tr.children[5].textContent = s.room || "—";
            tr.children[6].textContent = s.isLab ? "Yes" : "No";

            const editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.className = "btn-sm";
            editBtn.textContent = "Edit";
            editBtn.addEventListener("click", () => {
                dom.slotEditId.value = String(s.id);
                dom.slotSection.value = s.section;
                dom.slotDay.value = s.day;
                dom.slotStart.value = s.startTime;
                dom.slotEnd.value = s.endTime;
                dom.slotCourse.value = s.courseCode;
                dom.slotFaculty.value = s.facultyId ? String(s.facultyId) : "";
                dom.slotRoom.value = s.room || "";
                dom.slotIsLab.checked = s.isLab;
                dom.slotFormTitle.textContent = `Edit Slot #${s.id}`;
                dom.slotResetBtn.hidden = false;
            });

            const delBtn = document.createElement("button");
            delBtn.type = "button";
            delBtn.className = "btn-sm btn-danger";
            delBtn.textContent = "Delete";
            delBtn.addEventListener("click", async () => {
                try {
                    await apiFetch(`/api/admin/timetable/${s.id}`, { method: "DELETE" });
                    showNotice(`Deleted slot #${s.id}`);
                    loadAllAdminData();
                } catch (e) {
                    showNotice(e.message, true);
                }
            });
            tr.children[7].append(editBtn, delBtn);
            dom.slotsTbody.appendChild(tr);
        }
    }

    function buildLogsQuery() {
        const params = new URLSearchParams();
        if (dom.logsSearch.value.trim()) params.set("search", dom.logsSearch.value.trim());
        if (dom.logsSource.value) params.set("source", dom.logsSource.value);
        if (dom.logsFrom.value) params.set("fromDate", dom.logsFrom.value);
        if (dom.logsTo.value) params.set("toDate", dom.logsTo.value);
        return params.toString();
    }

    async function loadLogs() {
        try {
            const q = buildLogsQuery();
            const logs = await apiFetch(`/api/admin/logs?${q}`);
            dom.logsTbody.innerHTML = "";
            for (const row of logs) {
                const tr = document.createElement("tr");
                tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td>`;
                tr.children[0].textContent = String(row.id);
                tr.children[1].textContent = `${row.facultyName} (#${row.facultyId})`;
                tr.children[2].textContent = row.available ? "Available" : "Not available";
                tr.children[3].textContent = row.source;
                tr.children[4].textContent = app.formatIstTimestamp(row.createdAt);
                dom.logsTbody.appendChild(tr);
            }
        } catch (err) {
            showNotice(err.message, true);
        }
    }

    function renderDevicesTable() {
        const devByFac = new Map(adminState.devices.map((d) => [d.facultyId, d]));
        dom.devicesTbody.innerHTML = "";

        for (const f of adminState.faculty) {
            const dev = devByFac.get(f.id);
            const tr = document.createElement("tr");
            tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td><td></td><td class="admin-btn-cell"></td>`;
            tr.children[0].textContent = String(f.id);
            tr.children[1].textContent = f.name;
            tr.children[2].textContent = dev ? (dev.online ? "Online" : "Offline") : "Unregistered";
            tr.children[3].textContent = dev && dev.ip ? dev.ip : "—";
            tr.children[4].textContent = dev && dev.rssi !== null ? `${dev.rssi} dBm (${dev.signal})` : "—";
            tr.children[5].textContent = dev && dev.lastSeen ? app.formatIstTimestamp(dev.lastSeen) : "Never";

            const input = document.createElement("input");
            input.type = "text";
            input.className = "text-input";
            input.style.maxWidth = "150px";
            input.placeholder = `ESP32-FAC-${f.id}`;
            input.value = dev && dev.deviceLabel ? dev.deviceLabel : "";

            const saveBtn = document.createElement("button");
            saveBtn.type = "button";
            saveBtn.className = "btn-sm";
            saveBtn.textContent = "Save";
            saveBtn.addEventListener("click", async () => {
                try {
                    await apiFetch(`/api/admin/devices/${f.id}/label`, {
                        method: "PUT",
                        body: JSON.stringify({ deviceLabel: input.value })
                    });
                    showNotice(`Saved device mapping label for FACULTY_ID=${f.id}`);
                    loadAllAdminData();
                } catch (e) {
                    showNotice(e.message, true);
                }
            });

            tr.children[6].append(input, saveBtn);
            dom.devicesTbody.appendChild(tr);
        }
    }

    function renderDeviceLogsTable() {
        dom.deviceLogsTbody.innerHTML = "";
        for (const row of adminState.deviceLogs) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td></td><td></td><td></td><td></td><td></td>`;
            tr.children[0].textContent = String(row.id);
            tr.children[1].textContent = String(row.facultyId);
            tr.children[2].textContent = row.facultyName;
            tr.children[3].textContent = row.event;
            tr.children[4].textContent = app.formatIstTimestamp(row.at);
            dom.deviceLogsTbody.appendChild(tr);
        }
    }

    function bindEvents() {
        app.applyTheme();
        dom.themeBtn.addEventListener("click", () => {
            const cur = app.resolveEffectiveTheme(app.state.settings.theme);
            app.state.settings.theme = cur === "dark" ? "light" : "dark";
            app.saveSettings();
            app.applyTheme();
        });

        dom.tabBtns.forEach((btn) => {
            btn.addEventListener("click", () => {
                const target = btn.dataset.adminTab;
                dom.tabBtns.forEach((b) => b.classList.toggle("active", b === btn));
                document.querySelectorAll(".admin-panel").forEach((p) => {
                    p.hidden = p.id !== `admin-tab-${target}`;
                });
            });
        });

        dom.loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            dom.loginErr.hidden = true;
            try {
                const res = await fetch("/api/admin/login", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        username: dom.loginUser.value.trim(),
                        password: dom.loginPass.value
                    })
                });
                const body = await res.json();
                if (!res.ok) throw new Error(body.error || "Login failed");
                dom.loginPass.value = "";
                if (body.mustChangePassword) {
                    showForcePasswordChange();
                } else {
                    showConsole();
                }
            } catch (err) {
                dom.loginErr.hidden = false;
                dom.loginErr.textContent = err.message;
            }
        });

        dom.forcePwForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            dom.forcePwErr.hidden = true;
            const cur = document.getElementById("force-cur-pw").value;
            const nw = document.getElementById("force-new-pw").value;
            const conf = document.getElementById("force-confirm-pw").value;
            if (nw !== conf) {
                dom.forcePwErr.hidden = false;
                dom.forcePwErr.textContent = "Passwords do not match";
                return;
            }
            try {
                await apiFetch("/api/admin/change-password", {
                    method: "POST",
                    body: JSON.stringify({ currentPassword: cur, newPassword: nw })
                });
                dom.forcePwForm.reset();
                showConsole();
                showNotice("Initial password updated!");
            } catch (err) {
                dom.forcePwErr.hidden = false;
                dom.forcePwErr.textContent = err.message;
            }
        });

        dom.logoutBtn.addEventListener("click", async () => {
            await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" });
            showLogin();
        });

        dom.facResetBtn.addEventListener("click", () => {
            dom.facEditId.value = "";
            dom.facForm.reset();
            dom.facDept.value = "CSE (AI & ML)";
            dom.facFormTitle.textContent = "Add Faculty Member";
            dom.facResetBtn.hidden = true;
        });

        dom.facForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const editId = dom.facEditId.value;
            const payload = {
                name: dom.facName.value.trim(),
                designation: dom.facDesig.value.trim(),
                qualification: dom.facQual.value.trim(),
                department: dom.facDept.value.trim()
            };
            try {
                if (editId) {
                    await apiFetch(`/api/admin/faculty/${editId}`, { method: "PUT", body: JSON.stringify(payload) });
                    showNotice("Faculty updated");
                } else {
                    await apiFetch("/api/admin/faculty", { method: "POST", body: JSON.stringify(payload) });
                    showNotice("Faculty added");
                }
                dom.facResetBtn.click();
                loadAllAdminData();
            } catch (err) {
                showNotice(err.message, true);
            }
        });

        dom.slotResetBtn.addEventListener("click", () => {
            dom.slotEditId.value = "";
            dom.slotForm.reset();
            dom.slotStart.value = "09:00";
            dom.slotEnd.value = "10:00";
            dom.slotFormTitle.textContent = "Add Timetable Slot";
            dom.slotResetBtn.hidden = true;
        });

        dom.slotForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const editId = dom.slotEditId.value;
            const payload = {
                section: dom.slotSection.value,
                day: dom.slotDay.value,
                startTime: dom.slotStart.value,
                endTime: dom.slotEnd.value,
                courseCode: dom.slotCourse.value,
                facultyId: dom.slotFaculty.value ? Number(dom.slotFaculty.value) : null,
                room: dom.slotRoom.value.trim() || null,
                isLab: dom.slotIsLab.checked
            };
            try {
                if (editId) {
                    await apiFetch(`/api/admin/timetable/${editId}`, { method: "PUT", body: JSON.stringify(payload) });
                    showNotice(`Updated slot #${editId}`);
                } else {
                    await apiFetch("/api/admin/timetable", { method: "POST", body: JSON.stringify(payload) });
                    showNotice("Timetable slot added");
                }
                dom.slotResetBtn.click();
                loadAllAdminData();
            } catch (err) {
                showNotice(err.message, true);
            }
        });

        dom.slotFilterSec.addEventListener("change", renderSlotsTable);

        dom.logsForm.addEventListener("submit", (e) => {
            e.preventDefault();
            loadLogs();
        });

        dom.logsExportBtn.addEventListener("click", () => {
            window.location.href = `/api/admin/logs/export?${buildLogsQuery()}`;
        });

        dom.pwForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const cur = document.getElementById("pw-cur").value;
            const nw = document.getElementById("pw-new").value;
            const conf = document.getElementById("pw-confirm").value;
            if (nw !== conf) {
                showNotice("Passwords do not match", true);
                return;
            }
            try {
                await apiFetch("/api/admin/change-password", {
                    method: "POST",
                    body: JSON.stringify({ currentPassword: cur, newPassword: nw })
                });
                dom.pwForm.reset();
                showNotice("Admin password updated successfully");
            } catch (err) {
                showNotice(err.message, true);
            }
        });
    }

    bindEvents();
    checkSession();
})();
