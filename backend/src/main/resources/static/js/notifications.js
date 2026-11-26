(() => {
    "use strict";

    const app = window.CabinApp;

    const dom = {
        bellBtn: document.getElementById("notif-btn"),
        badge: document.getElementById("notif-badge"),
        dropdown: document.getElementById("notif-dropdown"),
        list: document.getElementById("notif-dropdown-list"),
        markReadBtn: document.getElementById("notif-mark-read-btn"),
        toastContainer: document.getElementById("toast-container")
    };

    function countUnread() {
        const items = app.state.notifications;
        if (!items.length) return 0;
        if (!app.state.lastSeenNotifId) return items.length;
        const idx = items.findIndex((n) => n.id === app.state.lastSeenNotifId);
        return idx === -1 ? items.length : idx;
    }

    function renderDropdown() {
        const items = app.state.notifications.slice(0, 20);
        const unread = countUnread();
        dom.badge.hidden = unread === 0;
        dom.badge.textContent = unread > 99 ? "99+" : String(unread);

        dom.list.innerHTML = "";
        if (!items.length) {
            dom.list.innerHTML = `<div class="dropdown-empty">No recent notifications yet.</div>`;
            return;
        }

        for (const item of items) {
            const row = document.createElement("div");
            row.className = "dropdown-item";

            const msg = document.createElement("div");
            msg.textContent = item.message;

            const meta = document.createElement("div");
            meta.className = "dropdown-item-meta";
            meta.textContent = `${app.timeAgo(item.createdAt)} · ${item.source}`;

            row.append(msg, meta);
            dom.list.appendChild(row);
        }
    }

    function showToast(title, body, variant = "default") {
        if (!app.state.settings.toastEnabled) return;
        const toast = document.createElement("div");
        toast.className = `toast toast-${variant}`;

        const titleEl = document.createElement("div");
        titleEl.className = "toast-title";
        titleEl.textContent = title;

        const bodyEl = document.createElement("div");
        bodyEl.textContent = body;

        toast.append(titleEl, bodyEl);
        dom.toastContainer.appendChild(toast);

        window.setTimeout(() => {
            toast.remove();
        }, 5500);
    }

    function sendBrowserNotification(title, body) {
        if (!app.state.settings.browserNotify) return;
        if ("Notification" in window && Notification.permission === "granted") {
            try {
                new Notification(title, { body });
            } catch {
                // Ignore Notification errors on restricted contexts.
            }
        }
    }

    async function loadNotifications() {
        try {
            const res = await fetch("/api/notifications?limit=20");
            if (!res.ok) return;
            app.state.notifications = await res.json();
            renderDropdown();
            if (app.dashboard) app.dashboard.render();
        } catch {
            // Keep existing notifications on temporary fetch error.
        }
    }

    function handleLiveStatusEvent(faculty, prevAvailable) {
        const statusLabel = faculty.available ? "Available" : "Not available";
        const isWatched = app.state.watchlist.has(faculty.id) && faculty.available && prevAvailable === false;

        if (isWatched) {
            showToast(
                `${faculty.name} is now Available!`,
                `Watched faculty cabin update (${app.formatIstTimestamp(faculty.updatedAt)})`,
                "watch"
            );
            sendBrowserNotification(`${faculty.name} is now Available`, "Dept. of CSE (AI & ML), VVCE Mysuru");
            app.playChime();
        } else {
            showToast(
                faculty.name,
                `Status updated to ${statusLabel}`,
                faculty.available ? "available" : "unavailable"
            );
            if (app.state.settings.browserNotify && prevAvailable !== faculty.available) {
                sendBrowserNotification(faculty.name, `Status: ${statusLabel}`);
            }
            app.playChime();
        }

        loadNotifications();
    }

    function handleLiveDeviceEvent(device) {
        const msg = device.online
            ? `Cabin device for ${device.facultyName} is back online`
            : `Cabin device for ${device.facultyName} went offline`;

        if (app.state.settings.deviceNotify) {
            showToast("ESP32 Device Status", msg, device.online ? "available" : "unavailable");
            if (app.state.settings.browserNotify) {
                sendBrowserNotification("ESP32 Cabin Monitor", msg);
            }
        }
        loadNotifications();
    }

    function toggleWatch(facultyId, facultyName) {
        if (app.state.watchlist.has(facultyId)) {
            app.state.watchlist.delete(facultyId);
            app.saveWatchlist();
            showToast("Notification removed", `Stopped watching ${facultyName}`);
            return;
        }

        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission().then((perm) => {
                if (perm === "granted") {
                    app.state.settings.browserNotify = true;
                    app.saveSettings();
                    if (app.settings) app.settings.syncInputs();
                }
            });
        }
        app.state.watchlist.add(facultyId);
        app.saveWatchlist();
        showToast("Watch enabled", `You will be notified when ${facultyName} becomes Available`, "watch");
    }

    function init() {
        dom.bellBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const open = dom.dropdown.hidden;
            dom.dropdown.hidden = !open;
            dom.bellBtn.setAttribute("aria-expanded", String(open));
            if (open && app.state.notifications.length) {
                app.markNotificationsSeen(app.state.notifications[0].id);
                renderDropdown();
            }
        });

        dom.markReadBtn.addEventListener("click", () => {
            if (app.state.notifications.length) {
                app.markNotificationsSeen(app.state.notifications[0].id);
                renderDropdown();
            }
        });

        document.addEventListener("click", (e) => {
            if (!dom.dropdown.hidden && !dom.dropdown.contains(e.target) && e.target !== dom.bellBtn) {
                dom.dropdown.hidden = true;
                dom.bellBtn.setAttribute("aria-expanded", "false");
            }
        });
    }

    app.notifications = {
        init,
        loadNotifications,
        renderDropdown,
        showToast,
        handleLiveStatusEvent,
        handleLiveDeviceEvent,
        toggleWatch
    };
})();
