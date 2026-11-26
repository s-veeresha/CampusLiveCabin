(() => {
    "use strict";

    const app = window.CabinApp;

    const DESIGNATION_RANK = {
        "Professor & Head": 1,
        "Professor": 2,
        "Associate Professor": 3,
        "Sr. Assistant Professor": 4,
        "Assistant Professor": 5
    };

    const dom = {
        grid: document.getElementById("faculty-grid"),
        emptyState: document.getElementById("empty-state"),
        searchInput: document.getElementById("search-input"),
        filterChips: Array.from(document.querySelectorAll(".chip")),
        sortSelect: document.getElementById("sort-select"),
        viewBtns: Array.from(document.querySelectorAll(".view-btn")),
        statTotal: document.getElementById("stat-total"),
        statAvailable: document.getElementById("stat-available"),
        statUnavailable: document.getElementById("stat-unavailable"),
        chipAll: document.getElementById("chip-all-count"),
        chipAvail: document.getElementById("chip-available-count"),
        chipUnavail: document.getElementById("chip-unavailable-count"),
        chipFav: document.getElementById("chip-fav-count"),
        modal: document.getElementById("faculty-modal"),
        modalCloseBtn: document.getElementById("modal-close-btn"),
        modalAvatar: document.getElementById("modal-avatar"),
        modalDesignation: document.getElementById("modal-designation"),
        modalName: document.getElementById("modal-faculty-name"),
        modalQualification: document.getElementById("modal-qualification"),
        modalDeptCollege: document.getElementById("modal-dept-college"),
        modalStatusBadge: document.getElementById("modal-status-badge"),
        modalUpdatedAt: document.getElementById("modal-updated-at"),
        modalDevicePill: document.getElementById("modal-device-pill"),
        modalCurrentClass: document.getElementById("modal-current-class"),
        modalNextClass: document.getElementById("modal-next-class"),
        modalTimetableGrid: document.getElementById("modal-timetable-grid")
    };

    function updateStats() {
        const faculty = app.state.faculty;
        const total = faculty.length;
        const avail = faculty.filter((f) => f.available).length;
        const unavail = total - avail;
        const favCount = faculty.filter((f) => app.state.favourites.has(f.id)).length;

        dom.statTotal.textContent = total;
        dom.statAvailable.textContent = avail;
        dom.statUnavailable.textContent = unavail;
        dom.chipAll.textContent = total;
        dom.chipAvail.textContent = avail;
        dom.chipUnavail.textContent = unavail;
        dom.chipFav.textContent = favCount;
    }

    function matchesFilters(item) {
        if (app.state.filter === "available" && !item.available) return false;
        if (app.state.filter === "unavailable" && item.available) return false;
        if (app.state.filter === "favourites" && !app.state.favourites.has(item.id)) return false;

        const q = app.state.search.trim().toLowerCase();
        if (!q) return true;

        const cabinNumber = item.cabinNumber || `Cabin-${String(item.id).padStart(2, "0")}`;
        const haystack = [
            item.name,
            cabinNumber,
            item.designation,
            item.qualification,
            item.currentClass ? item.currentClass.courseCode : "",
            item.currentClass ? item.currentClass.courseName : "",
            item.currentClass ? item.currentClass.room : ""
        ].join(" ").toLowerCase();

        return haystack.includes(q);
    }

    function sortItems(items) {
        return [...items].sort((a, b) => {
            const aFav = app.state.favourites.has(a.id) ? 0 : 1;
            const bFav = app.state.favourites.has(b.id) ? 0 : 1;
            if (aFav !== bFav) return aFav - bFav;

            switch (app.state.sortBy) {
                case "name":
                    return a.name.localeCompare(b.name);
                case "designation": {
                    const ra = DESIGNATION_RANK[a.designation] || 99;
                    const rb = DESIGNATION_RANK[b.designation] || 99;
                    return ra !== rb ? ra - rb : a.id - b.id;
                }
                case "updated": {
                    const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                    const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                    return tb - ta;
                }
                default:
                    return a.id - b.id;
            }
        });
    }

    function formatInClassLine(currentClass) {
        if (!currentClass) return "";
        const course = currentClass.courseName
            ? `${currentClass.courseCode} (${currentClass.courseName})`
            : currentClass.courseCode;
        const room = currentClass.room || "TBA";
        return `In class: ${course}, Sec ${currentClass.section}, Room ${room}`;
    }

    function createFacultyCard(item) {
        const card = document.createElement("article");
        card.className = `faculty-card ${app.getDesignationClass(item.designation)}`;
        card.dataset.facultyId = String(item.id);

        const headerRow = document.createElement("div");
        headerRow.className = "card-header-row";

        const mainBtn = document.createElement("button");
        mainBtn.type = "button";
        mainBtn.className = "card-main-btn";
        mainBtn.setAttribute("aria-label", `${item.name}, ${item.designation}, ${item.available ? "Available" : "Not available"}. View timetable.`);

        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.setAttribute("aria-hidden", "true");
        avatar.textContent = app.getInitials(item.name);

        const identity = document.createElement("div");
        identity.className = "card-identity";

        const nameEl = document.createElement("h2");
        nameEl.className = "faculty-name";
        nameEl.textContent = item.name;

        const cabinNumber = item.cabinNumber || `Cabin-${String(item.id).padStart(2, "0")}`;

        const metaRow = document.createElement("div");
        metaRow.className = "faculty-meta-row";

        const desigEl = document.createElement("span");
        desigEl.className = "faculty-designation";
        desigEl.textContent = item.designation;

        const cabinEl = document.createElement("span");
        cabinEl.className = "cabin-badge";
        cabinEl.textContent = cabinNumber;

        metaRow.append(desigEl, cabinEl);

        const qualEl = document.createElement("div");
        qualEl.className = "faculty-qual";
        qualEl.textContent = item.qualification;

        identity.append(nameEl, metaRow, qualEl);
        mainBtn.append(avatar, identity);
        mainBtn.addEventListener("click", () => openModal(item.id, mainBtn));

        const actions = document.createElement("div");
        actions.className = "card-actions";

        const isFav = app.state.favourites.has(item.id);
        const favBtn = document.createElement("button");
        favBtn.type = "button";
        favBtn.className = `mini-action-btn${isFav ? " is-active-fav" : ""}`;
        favBtn.innerHTML = isFav ? "&#9733;" : "&#9734;";
        favBtn.title = isFav ? "Unpin favourite" : "Pin to favourites";
        favBtn.setAttribute("aria-label", `${isFav ? "Unpin" : "Pin"} ${item.name} as favourite`);
        favBtn.setAttribute("aria-pressed", String(isFav));
        favBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (app.state.favourites.has(item.id)) {
                app.state.favourites.delete(item.id);
            } else {
                app.state.favourites.add(item.id);
            }
            app.saveFavourites();
            render();
        });

        const isWatched = app.state.watchlist.has(item.id);
        const watchBtn = document.createElement("button");
        watchBtn.type = "button";
        watchBtn.className = `mini-action-btn${isWatched ? " is-active-watch" : ""}`;
        watchBtn.innerHTML = "&#128276;";
        watchBtn.title = isWatched ? "Watching availability" : "Notify me when available";
        watchBtn.setAttribute("aria-label", `Notify me when ${item.name} is available`);
        watchBtn.setAttribute("aria-pressed", String(isWatched));
        watchBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            app.notifications.toggleWatch(item.id, item.name);
            render();
        });

        actions.append(favBtn, watchBtn);
        headerRow.append(mainBtn, actions);
        card.appendChild(headerRow);

        if (item.currentClass) {
            const classLine = document.createElement("div");
            classLine.className = "in-class-banner";
            classLine.innerHTML = `<span class="in-class-dot" aria-hidden="true"></span><span></span>`;
            classLine.querySelector("span:last-child").textContent = formatInClassLine(item.currentClass);
            card.appendChild(classLine);
        }

        const staleHours = app.getStaleHours(item.updatedAt);
        const device = item.device;
        if (staleHours !== null || device) {
            const tagsRow = document.createElement("div");
            tagsRow.className = "tags-row";

            if (staleHours !== null) {
                const stale = document.createElement("span");
                stale.className = "stale-tag";
                stale.textContent = `Not updated for ${staleHours} hours`;
                tagsRow.appendChild(stale);
            }

            if (device) {
                const devTag = document.createElement("span");
                devTag.className = "device-tag";
                devTag.title = device.lastSeen ? `Last seen: ${app.formatIstTimestamp(device.lastSeen)}` : "Never seen";
                const dot = document.createElement("span");
                dot.className = `device-dot ${device.online ? "online" : "offline"}`;
                const txt = document.createElement("span");
                txt.textContent = device.online ? "Device online" : "Device offline - status may be outdated";
                devTag.append(dot, txt);
                tagsRow.appendChild(devTag);
            }

            card.appendChild(tagsRow);
        }

        const footer = document.createElement("div");
        footer.className = "card-footer";

        const badge = document.createElement("span");
        badge.className = `status-badge ${item.available ? "is-available" : "is-unavailable"}`;
        badge.textContent = item.available ? "Available" : "Not available";

        const updated = document.createElement("span");
        updated.className = "updated-time";
        updated.textContent = (device && !device.online)
            ? `Last updated by button at ${app.formatIstTimestamp(item.updatedAt)}`
            : app.formatIstTimestamp(item.updatedAt);

        footer.append(badge, updated);
        card.appendChild(footer);

        return card;
    }

    function render(flashFacultyId = null) {
        updateStats();
        dom.grid.classList.toggle("is-list-view", app.state.viewMode === "list");
        dom.grid.classList.toggle("is-compact", app.state.settings.layout === "compact");

        const filtered = sortItems(app.state.faculty.filter(matchesFilters));
        dom.grid.innerHTML = "";

        if (filtered.length === 0) {
            dom.emptyState.hidden = false;
            return;
        }
        dom.emptyState.hidden = true;

        const fragment = document.createDocumentFragment();
        for (const item of filtered) {
            const card = createFacultyCard(item);
            if (flashFacultyId === item.id) {
                card.classList.add(item.available ? "flash-available" : "flash-unavailable");
            }
            fragment.appendChild(card);
        }
        dom.grid.appendChild(fragment);
    }

    function updateModalHeader(faculty) {
        const cabinNumber = faculty.cabinNumber || `Cabin-${String(faculty.id).padStart(2, "0")}`;
        dom.modalAvatar.textContent = app.getInitials(faculty.name);
        dom.modalAvatar.className = `avatar avatar-lg ${app.getDesignationClass(faculty.designation)}`;
        dom.modalDesignation.innerHTML = `${faculty.designation} <span class="cabin-badge" style="margin-left:8px">${cabinNumber}</span>`;
        dom.modalName.textContent = faculty.name;
        dom.modalQualification.textContent = faculty.qualification;
        dom.modalDeptCollege.textContent = `${cabinNumber} · ${faculty.department} · ${faculty.college}`;
        dom.modalStatusBadge.className = `status-badge ${faculty.available ? "is-available" : "is-unavailable"}`;
        dom.modalStatusBadge.textContent = faculty.available ? "Available" : "Not available";
        dom.modalUpdatedAt.textContent = `Last updated: ${app.formatIstTimestamp(faculty.updatedAt)}`;

        if (faculty.device) {
            dom.modalDevicePill.hidden = false;
            dom.modalDevicePill.textContent = faculty.device.online
                ? `ESP32 Online (${faculty.device.ip || "--"}, ${faculty.device.signal})`
                : `ESP32 Offline (last seen ${app.timeAgo(faculty.device.lastSeen)})`;
        } else {
            dom.modalDevicePill.hidden = true;
        }
    }

    function renderSlotSummary(el, slot, emptyMsg, includeDay) {
        el.innerHTML = "";
        if (!slot) {
            el.textContent = emptyMsg;
            return;
        }
        const main = document.createElement("div");
        main.className = "highlight-main";
        main.textContent = `${slot.courseCode} — ${slot.courseName}`;
        const meta = document.createElement("div");
        meta.className = "highlight-meta";
        const dayStr = includeDay ? `${app.DAY_LABELS[slot.day] || slot.day} · ` : "";
        const timeStr = app.formatSlotTimeRange(slot.startTime, slot.endTime) || slot.time;
        meta.textContent = `${dayStr}${timeStr} · Sec ${slot.section} · ${slot.room ? "Room " + slot.room : "Room TBA"}`;
        el.append(main, meta);
    }

    function renderWeeklyGrid(classes, currentDay, currentClass) {
        dom.modalTimetableGrid.innerHTML = "";
        if (!classes || !classes.length) {
            dom.modalTimetableGrid.innerHTML = `<div class="no-classes-box">No 5th-semester classes assigned in this timetable.</div>`;
            return;
        }

        const byDay = new Map(app.DAYS.map((d) => [d, []]));
        classes.forEach((slot) => {
            if (byDay.has(slot.day)) byDay.get(slot.day).push(slot);
        });

        for (const day of app.DAYS) {
            const col = document.createElement("div");
            col.className = `day-column${day === currentDay ? " is-today" : ""}`;
            const header = document.createElement("div");
            header.className = "day-header";
            header.textContent = day;
            col.appendChild(header);

            const slots = byDay.get(day);
            if (!slots.length) {
                col.innerHTML += `<div class="day-empty">—</div>`;
            } else {
                for (const slot of slots) {
                    const pill = document.createElement("div");
                    const isActive = currentClass && currentClass.id === slot.id;
                    pill.className = `slot-pill${slot.isLab ? " is-lab" : ""}${isActive ? " is-current" : ""}`;

                    const timeEl = document.createElement("div");
                    timeEl.className = "slot-time";
                    timeEl.textContent = app.formatSlotTimeRange(slot.startTime, slot.endTime) || slot.time;

                    const courseEl = document.createElement("div");
                    courseEl.className = "slot-course";
                    courseEl.textContent = `${slot.courseCode} (${slot.courseName})`;

                    const metaEl = document.createElement("div");
                    metaEl.className = "slot-meta";
                    metaEl.textContent = `Sec ${slot.section} · ${slot.room || "TBA"}${slot.isLab ? " · Lab" : ""}`;

                    pill.append(timeEl, courseEl, metaEl);
                    col.appendChild(pill);
                }
            }
            dom.modalTimetableGrid.appendChild(col);
        }
    }

    async function openModal(facultyId, triggerEl) {
        const faculty = app.state.faculty.find((f) => f.id === facultyId);
        if (!faculty) return;

        app.state.openFacultyId = facultyId;
        app.state.lastFocusedElement = triggerEl || document.activeElement;
        updateModalHeader(faculty);
        dom.modalCurrentClass.textContent = "Checking current IST slot...";
        dom.modalNextClass.textContent = "Finding next class...";
        dom.modalTimetableGrid.innerHTML = `<div class="loading-state">Loading timetable...</div>`;
        dom.modal.hidden = false;
        dom.modalCloseBtn.focus();

        try {
            const [nowRes, ttRes] = await Promise.all([
                fetch(`/api/faculty/${facultyId}/now`),
                fetch(`/api/faculty/${facultyId}/timetable`)
            ]);
            if (!nowRes.ok || !ttRes.ok) throw new Error("Failed");
            const [nowData, ttData] = await Promise.all([nowRes.json(), ttRes.json()]);
            if (app.state.openFacultyId !== facultyId) return;

            renderSlotSummary(dom.modalCurrentClass, nowData.currentClass, "No scheduled class right now", false);
            renderSlotSummary(dom.modalNextClass, nowData.nextClass, "No classes scheduled", true);
            renderWeeklyGrid(ttData.classes, nowData.currentDay, nowData.currentClass);
        } catch {
            if (app.state.openFacultyId !== facultyId) return;
            dom.modalCurrentClass.textContent = "Unable to load schedule.";
            dom.modalNextClass.textContent = "Unable to load schedule.";
            dom.modalTimetableGrid.innerHTML = `<div class="no-classes-box">Could not load timetable details.</div>`;
        }
    }

    function closeModal() {
        const closedId = app.state.openFacultyId;
        dom.modal.hidden = true;
        app.state.openFacultyId = null;
        if (app.state.lastFocusedElement && document.contains(app.state.lastFocusedElement)) {
            app.state.lastFocusedElement.focus();
            return;
        }
        if (closedId !== null) {
            const btn = dom.grid.querySelector(`[data-faculty-id="${closedId}"] .card-main-btn`);
            if (btn) btn.focus();
        }
    }

    function syncViewButtons() {
        dom.viewBtns.forEach((btn) => {
            const active = btn.dataset.view === app.state.viewMode;
            btn.classList.toggle("active", active);
            btn.setAttribute("aria-pressed", String(active));
        });
    }

    function init() {
        syncViewButtons();

        dom.searchInput.addEventListener("input", (e) => {
            app.state.search = e.target.value;
            render();
        });

        dom.filterChips.forEach((chip) => {
            chip.addEventListener("click", () => {
                app.state.filter = chip.dataset.filter || "all";
                dom.filterChips.forEach((b) => {
                    const active = b === chip;
                    b.classList.toggle("active", active);
                    b.setAttribute("aria-pressed", String(active));
                });
                render();
            });
        });

        dom.sortSelect.addEventListener("change", () => {
            app.state.sortBy = dom.sortSelect.value;
            render();
        });

        dom.viewBtns.forEach((btn) => {
            btn.addEventListener("click", () => {
                app.state.viewMode = btn.dataset.view || "cards";
                syncViewButtons();
                render();
            });
        });

        dom.modalCloseBtn.addEventListener("click", closeModal);
        dom.modal.addEventListener("click", (e) => {
            if (e.target === dom.modal) closeModal();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !dom.modal.hidden) closeModal();
        });
    }

    app.directory = {
        init,
        render,
        updateStats,
        updateModalHeader,
        syncViewButtons
    };
})();
