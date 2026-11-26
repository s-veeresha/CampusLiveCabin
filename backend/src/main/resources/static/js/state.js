(() => {
    "use strict";

    const SETTINGS_KEY = "vvce_cabin_settings_v1";
    const FAVS_KEY = "vvce_cabin_favourites_v1";
    const WATCH_KEY = "vvce_cabin_watchlist_v1";
    const SEEN_NOTIF_KEY = "vvce_cabin_seen_notif_v1";

    const DEFAULT_SETTINGS = {
        theme: "system",
        layout: "comfortable",
        defaultView: "cards",
        timeFormat: "12h",
        defaultSection: "A",
        toastEnabled: true,
        sound: true,
        browserNotify: false,
        deviceNotify: true
    };

    function loadJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch {
            return fallback;
        }
    }

    function saveJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // Ignore storage quota errors in private browsing.
        }
    }

    const app = window.CabinApp = {
        DAYS: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
        DAY_LABELS: {
            MON: "Monday",
            TUE: "Tuesday",
            WED: "Wednesday",
            THU: "Thursday",
            FRI: "Friday",
            SAT: "Saturday"
        },
        DEFAULT_SETTINGS,
        state: {
            faculty: [],
            devices: [],
            notifications: [],
            filter: "all",
            search: "",
            sortBy: "default",
            viewMode: "cards",
            activeTab: "directory",
            openFacultyId: null,
            lastFocusedElement: null,
            lastSyncTime: null,
            sseConnected: false,
            eventSource: null,
            reconnectDelayMs: 1000,
            reconnectTimer: null,
            lastSseActivityAt: 0,
            settings: { ...DEFAULT_SETTINGS, ...loadJson(SETTINGS_KEY, {}) },
            favourites: new Set(loadJson(FAVS_KEY, [])),
            watchlist: new Set(loadJson(WATCH_KEY, [])),
            lastSeenNotifId: localStorage.getItem(SEEN_NOTIF_KEY) || ""
        },

        saveSettings() {
            saveJson(SETTINGS_KEY, app.state.settings);
        },

        resetSettings() {
            app.state.settings = { ...DEFAULT_SETTINGS };
            app.saveSettings();
        },

        saveFavourites() {
            saveJson(FAVS_KEY, Array.from(app.state.favourites));
        },

        saveWatchlist() {
            saveJson(WATCH_KEY, Array.from(app.state.watchlist));
        },

        markNotificationsSeen(latestId) {
            if (!latestId) return;
            app.state.lastSeenNotifId = latestId;
            try {
                localStorage.setItem(SEEN_NOTIF_KEY, latestId);
            } catch {
                // Ignore storage error.
            }
        },

        resolveEffectiveTheme(themeSetting) {
            if (themeSetting === "dark" || themeSetting === "light") {
                return themeSetting;
            }
            return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
                ? "dark"
                : "light";
        },

        applyTheme() {
            const effective = app.resolveEffectiveTheme(app.state.settings.theme);
            document.documentElement.dataset.theme = effective;
        },

        getInitials(name) {
            const cleaned = (name || "").replace(/\bDr\.?\s*/gi, "").trim();
            const parts = cleaned.split(/\s+/).filter(Boolean);
            if (parts.length === 0) return "FC";
            if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
            return (parts[0][0] + parts[1][0]).toUpperCase();
        },

        getDesignationClass(designation) {
            const d = (designation || "").toLowerCase();
            if (d.includes("head")) return "role-hod";
            if (d.includes("associate")) return "role-assoc";
            if (d.includes("sr.")) return "role-sr-asst";
            if (d.includes("assistant")) return "role-asst";
            if (d.includes("professor")) return "role-prof";
            return "role-asst";
        },

        formatIstTimestamp(isoString) {
            if (!isoString) return "Not updated yet";
            const parsed = new Date(isoString);
            if (Number.isNaN(parsed.getTime())) return isoString;
            const use24 = app.state.settings.timeFormat === "24h";
            return parsed.toLocaleString("en-IN", {
                timeZone: "Asia/Kolkata",
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                hour12: !use24
            }) + " IST";
        },

        formatSlotTimeRange(start24, end24) {
            if (!start24 || !end24) return "";
            if (app.state.settings.timeFormat === "24h") {
                return `${start24} - ${end24}`;
            }
            const fmt = (hhmm) => {
                const [hStr, mStr] = hhmm.split(":");
                const h = Number(hStr);
                const suffix = h >= 12 ? "PM" : "AM";
                const h12 = h % 12 === 0 ? 12 : h % 12;
                return `${h12}:${mStr} ${suffix}`;
            };
            return `${fmt(start24)} - ${fmt(end24)}`;
        },

        timeAgo(isoString) {
            if (!isoString) return "--";
            const ts = new Date(isoString).getTime();
            if (Number.isNaN(ts)) return isoString;
            const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
            if (diffSec < 60) return "just now";
            const mins = Math.floor(diffSec / 60);
            if (mins < 60) return `${mins} min ago`;
            const hours = Math.floor(mins / 60);
            if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
            const days = Math.floor(hours / 24);
            return `${days} day${days === 1 ? "" : "s"} ago`;
        },

        getStaleHours(isoString) {
            if (!isoString) return null;
            const ts = new Date(isoString).getTime();
            if (Number.isNaN(ts)) return null;
            const hours = Math.floor((Date.now() - ts) / 3600000);
            return hours >= 8 ? hours : null;
        },

        playChime() {
            if (!app.state.settings.sound) return;
            try {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (!AudioCtx) return;
                const ctx = new AudioCtx();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "sine";
                osc.frequency.setValueAtTime(660, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
                gain.gain.setValueAtTime(0.08, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.26);
            } catch {
                // Ignore browser autoplay restrictions.
            }
        }
    };
})();
