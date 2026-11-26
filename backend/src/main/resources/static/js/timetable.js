(() => {
    "use strict";

    const app = window.CabinApp;

    const COLUMNS = [
        { key: "09:00", start: "09:00", end: "10:00", label: "9:00 - 10:00" },
        { key: "10:00", start: "10:00", end: "11:00", label: "10:00 - 11:00" },
        { key: "TEA", breakLabel: "Tea Break", start: "11:00", end: "11:30", label: "11:00 - 11:30" },
        { key: "11:30", start: "11:30", end: "12:30", label: "11:30 - 12:30" },
        { key: "12:30", start: "12:30", end: "13:30", label: "12:30 - 1:30" },
        { key: "LUNCH", breakLabel: "Lunch Break", start: "13:30", end: "14:30", label: "1:30 - 2:30" },
        { key: "14:30", start: "14:30", end: "15:30", label: "2:30 - 3:30" },
        { key: "15:30", start: "15:30", end: "16:30", label: "3:30 - 4:30" },
        { key: "16:30", start: "16:30", end: "18:30", label: "4:30 - 6:30" }
    ];

    const ELECTIVE_CODES = new Set(["BCIXX504", "BCIXX508", "BCIMP507", "NSSPEYOGA"]);

    const ttState = {
        section: "A",
        data: null,
        selectedDay: "MON",
        selectedFacultyId: "",
        facultyFreeData: null
    };

    const dom = {
        sectionBtns: Array.from(document.querySelectorAll(".tt-section-tabs .chip")),
        facultyFilter: document.getElementById("tt-faculty-filter"),
        printBtn: document.getElementById("tt-print-btn"),
        csvBtn: document.getElementById("tt-csv-btn"),
        bannerTitle: document.getElementById("tt-banner-title"),
        bannerSub: document.getElementById("tt-banner-sub"),
        sectionView: document.getElementById("tt-section-view"),
        facultyView: document.getElementById("tt-faculty-view"),
        mobileDays: document.getElementById("tt-mobile-days"),
        mobileDayCard: document.getElementById("tt-mobile-day-card"),
        desktopTbody: document.getElementById("tt-desktop-tbody"),
        legendTbody: document.getElementById("tt-legend-tbody"),
        facBusyTitle: document.getElementById("tt-fac-busy-title"),
        facBusyList: document.getElementById("tt-fac-busy-list"),
        facFreeList: document.getElementById("tt-fac-free-list")
    };

    function getCurrentIstDayAndMinutes() {
        const now = new Date();
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Kolkata",
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        }).formatToParts(now);

        const map = {};
        parts.forEach((p) => { map[p.type] = p.value; });
        const dayCode = (map.weekday || "MON").slice(0, 3).toUpperCase();
        const mins = Number(map.hour) * 60 + Number(map.minute);
        return { dayCode, mins };
    }

    function toMins(hhmm) {
        const [h, m] = hhmm.split(":").map(Number);
        return h * 60 + m;
    }

    function isSlotNow(day, start, end, ist) {
        if (day !== ist.dayCode) return false;
        return ist.mins >= toMins(start) && ist.mins < toMins(end);
    }

    function groupSlotsByDayAndStart(slots) {
        const map = new Map();
        for (const slot of slots) {
            const key = `${slot.day}|${slot.startTime}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(slot);
        }
        return map;
    }

    function populateFacultyDropdown() {
        const current = dom.facultyFilter.value;
        dom.facultyFilter.innerHTML = `<option value="">All Faculty (Section View)</option>`;
        for (const f of app.state.faculty) {
            const opt = document.createElement("option");
            opt.value = String(f.id);
            const cabin = f.cabinNumber || `Cabin-${String(f.id).padStart(2, "0")}`;
            opt.textContent = `${f.name} (${cabin} · ${f.designation})`;
            dom.facultyFilter.appendChild(opt);
        }
        dom.facultyFilter.value = current;
    }

    function buildCellContent(group) {
        const first = group[0];
        const code = document.createElement("div");
        code.className = "tt-cell-code";
        code.textContent = first.courseCode;

        const name = document.createElement("div");
        name.className = "tt-cell-name";
        name.textContent = first.courseName;

        const faculty = document.createElement("div");
        faculty.className = "tt-cell-faculty";

        if (group.length > 1) {
            faculty.textContent = group
                .map((g) => `${g.facultyName || "TBA"} (${g.room || "TBA"})`)
                .join(" · ");
        } else {
            const facName = first.facultyName || (first.courseCode === "BCIXX508" ? "Open Elective-1" : "No assigned faculty");
            const roomPart = first.room ? ` · Room ${first.room}` : "";
            faculty.textContent = `${facName}${roomPart}`;
        }

        const wrap = document.createElement("div");
        wrap.append(code, name, faculty);
        return wrap;
    }

    function getCellClass(group, ist) {
        const first = group[0];
        const classes = ["tt-cell-filled"];
        if (first.isLab) {
            classes.push("tt-cell-lab");
        } else if (ELECTIVE_CODES.has(first.courseCode)) {
            classes.push("tt-cell-elective");
        }
        if (isSlotNow(first.day, first.startTime, first.endTime, ist)) {
            classes.push("tt-cell-now");
        }
        return classes.join(" ");
    }

    function renderDesktopTable() {
        const data = ttState.data;
        if (!data) return;

        const ist = getCurrentIstDayAndMinutes();
        const grouped = groupSlotsByDayAndStart(data.slots);
        dom.desktopTbody.innerHTML = "";

        for (const day of app.DAYS) {
            const tr = document.createElement("tr");
            if (day === ist.dayCode) tr.classList.add("tt-today-row");

            const dayTh = document.createElement("th");
            dayTh.scope = "row";
            dayTh.className = "tt-day-col";
            dayTh.textContent = day;
            tr.appendChild(dayTh);

            let skipNextTeachingCol = false;
            for (let i = 0; i < COLUMNS.length; i++) {
                const col = COLUMNS[i];
                if (col.breakLabel) {
                    const td = document.createElement("td");
                    td.className = "tt-break-cell";
                    td.textContent = col.breakLabel;
                    tr.appendChild(td);
                    continue;
                }

                if (skipNextTeachingCol) {
                    skipNextTeachingCol = false;
                    continue;
                }

                const group = grouped.get(`${day}|${col.start}`);
                const td = document.createElement("td");

                if (!group || !group.length) {
                    td.className = "tt-cell-empty";
                    td.textContent = "—";
                    tr.appendChild(td);
                    continue;
                }

                const first = group[0];
                const duration = toMins(first.endTime) - toMins(first.startTime);
                if (duration > 60 && (col.start === "09:00" || col.start === "11:30" || col.start === "14:30")) {
                    td.colSpan = 2;
                    skipNextTeachingCol = true;
                }

                td.className = getCellClass(group, ist);
                td.appendChild(buildCellContent(group));
                tr.appendChild(td);
            }

            dom.desktopTbody.appendChild(tr);
        }
    }

    function renderMobileDayView() {
        const data = ttState.data;
        if (!data) return;

        const ist = getCurrentIstDayAndMinutes();
        const grouped = groupSlotsByDayAndStart(data.slots);

        dom.mobileDays.innerHTML = "";
        for (const day of app.DAYS) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `chip${ttState.selectedDay === day ? " active" : ""}`;
            btn.textContent = day === ist.dayCode ? `${day} (Today)` : day;
            btn.addEventListener("click", () => {
                ttState.selectedDay = day;
                renderMobileDayView();
            });
            dom.mobileDays.appendChild(btn);
        }

        dom.mobileDayCard.innerHTML = "";
        let skipNext = false;
        for (const col of COLUMNS) {
            if (col.breakLabel) {
                const band = document.createElement("div");
                band.className = "tt-mobile-break-row";
                band.textContent = `${col.breakLabel} (${app.formatSlotTimeRange(col.start, col.end)})`;
                dom.mobileDayCard.appendChild(band);
                continue;
            }
            if (skipNext) {
                skipNext = false;
                continue;
            }

            const group = grouped.get(`${ttState.selectedDay}|${col.start}`);
            const row = document.createElement("div");
            row.className = "tt-mobile-slot";

            const timeEl = document.createElement("div");
            timeEl.className = "tt-mobile-time";

            if (group && group.length) {
                const first = group[0];
                const duration = toMins(first.endTime) - toMins(first.startTime);
                if (duration > 60) skipNext = true;
                timeEl.textContent = app.formatSlotTimeRange(first.startTime, first.endTime);
                row.className = `tt-mobile-slot ${getCellClass(group, ist)}`;
                const content = buildCellContent(group);
                row.append(timeEl, content);
            } else {
                timeEl.textContent = app.formatSlotTimeRange(col.start, col.end);
                const empty = document.createElement("div");
                empty.className = "muted-text";
                empty.textContent = "Free / No class";
                row.append(timeEl, empty);
            }
            dom.mobileDayCard.appendChild(row);
        }
    }

    function renderLegend() {
        const data = ttState.data;
        if (!data) return;

        dom.bannerTitle.textContent = `SEM: V '${data.section}' · Room ${data.defaultRoom}`;
        dom.bannerSub.textContent = `${data.academicTerm} · Dated ${data.effectiveDate} · ${data.version}`;

        dom.legendTbody.innerHTML = "";
        for (const item of data.legend) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td><strong></strong></td><td></td><td></td>`;
            tr.children[0].querySelector("strong").textContent = item.courseCode;
            tr.children[1].textContent = item.courseName;
            tr.children[2].textContent = item.facultySummary;
            dom.legendTbody.appendChild(tr);
        }
    }

    function renderFacultyView() {
        const data = ttState.facultyFreeData;
        if (!data) return;

        dom.facBusyTitle.textContent = `${data.facultyName} (${data.designation}) — Assigned Classes`;
        dom.facBusyList.innerHTML = "";

        if (!data.busySlots.length) {
            dom.facBusyList.innerHTML = `<div class="muted-text">No 5th-semester classes assigned across Sections A, B, or C.</div>`;
        } else {
            for (const slot of data.busySlots) {
                const row = document.createElement("div");
                row.className = "timeline-item";
                const left = document.createElement("div");
                left.innerHTML = `<strong></strong><div></div>`;
                left.querySelector("strong").textContent = `${slot.day} · ${app.formatSlotTimeRange(slot.startTime, slot.endTime)}`;
                left.querySelector("div").textContent = `${slot.courseCode} — ${slot.courseName}`;
                const right = document.createElement("div");
                right.className = "muted-text";
                right.textContent = `Sec ${slot.section} · ${slot.room || "TBA"}`;
                row.append(left, right);
                dom.facBusyList.appendChild(row);
            }
        }

        dom.facFreeList.innerHTML = "";
        const byDay = new Map(app.DAYS.map((d) => [d, []]));
        data.freeSlots.forEach((f) => {
            if (byDay.has(f.day)) byDay.get(f.day).push(f);
        });

        for (const day of app.DAYS) {
            const box = document.createElement("div");
            box.className = "free-day-box";
            const head = document.createElement("div");
            head.className = "free-day-title";
            head.textContent = day;
            box.appendChild(head);

            const slots = byDay.get(day);
            if (!slots.length) {
                box.innerHTML += `<span class="muted-text">Fully booked</span>`;
            } else {
                for (const s of slots) {
                    const tag = document.createElement("span");
                    tag.className = "free-slot-pill";
                    tag.textContent = app.formatSlotTimeRange(s.startTime, s.endTime);
                    box.appendChild(tag);
                }
            }
            dom.facFreeList.appendChild(box);
        }
    }

    async function loadSection(section) {
        ttState.section = section;
        dom.sectionBtns.forEach((btn) => {
            const active = btn.dataset.section === section;
            btn.classList.toggle("active", active);
            btn.setAttribute("aria-pressed", String(active));
        });

        try {
            const res = await fetch(`/api/timetable?section=${encodeURIComponent(section)}`);
            if (!res.ok) return;
            ttState.data = await res.json();
            renderDesktopTable();
            renderMobileDayView();
            renderLegend();
        } catch {
            // Keep existing table on transient error.
        }
    }

    async function loadFacultySchedule(facultyId) {
        ttState.selectedFacultyId = facultyId;
        if (!facultyId) {
            dom.sectionView.hidden = false;
            dom.facultyView.hidden = true;
            return;
        }
        dom.sectionView.hidden = true;
        dom.facultyView.hidden = false;

        try {
            const res = await fetch(`/api/timetable/free?facultyId=${encodeURIComponent(facultyId)}`);
            if (!res.ok) return;
            ttState.facultyFreeData = await res.json();
            renderFacultyView();
        } catch {
            // Ignore temporary fetch errors.
        }
    }

    function downloadCsv() {
        if (ttState.selectedFacultyId && ttState.facultyFreeData) {
            const rows = [["Day", "Start", "End", "Course Code", "Course Name", "Section", "Room"]];
            for (const s of ttState.facultyFreeData.busySlots) {
                rows.push([s.day, s.startTime, s.endTime, s.courseCode, s.courseName, s.section, s.room || ""]);
            }
            triggerCsv(`faculty_${ttState.selectedFacultyId}_timetable.csv`, rows);
            return;
        }
        if (!ttState.data) return;
        const rows = [["Section", "Day", "Start", "End", "Course Code", "Course Name", "Faculty", "Room", "Lab"]];
        for (const s of ttState.data.slots) {
            rows.push([s.section, s.day, s.startTime, s.endTime, s.courseCode, s.courseName, s.facultyName || "", s.room || "", s.isLab ? "Yes" : "No"]);
        }
        triggerCsv(`vvce_sem5_section_${ttState.section}_timetable.csv`, rows);
    }

    function triggerCsv(filename, rows) {
        const csv = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }

    function render() {
        populateFacultyDropdown();
        if (ttState.selectedFacultyId) {
            renderFacultyView();
        } else if (ttState.data) {
            renderDesktopTable();
            renderMobileDayView();
        } else {
            loadSection(ttState.section);
        }
    }

    function init() {
        const ist = getCurrentIstDayAndMinutes();
        ttState.selectedDay = app.DAYS.includes(ist.dayCode) ? ist.dayCode : "MON";
        ttState.section = app.state.settings.defaultSection || "A";

        dom.sectionBtns.forEach((btn) => {
            btn.addEventListener("click", () => {
                dom.facultyFilter.value = "";
                ttState.selectedFacultyId = "";
                dom.sectionView.hidden = false;
                dom.facultyView.hidden = true;
                loadSection(btn.dataset.section);
            });
        });

        dom.facultyFilter.addEventListener("change", () => {
            loadFacultySchedule(dom.facultyFilter.value);
        });

        dom.printBtn.addEventListener("click", () => window.print());
        dom.csvBtn.addEventListener("click", downloadCsv);
    }

    app.timetable = { init, render };
})();
