(() => {
    "use strict";

    const app = window.CabinApp;

    const dom = {
        openBtn: document.getElementById("settings-btn"),
        closeBtn: document.getElementById("settings-close-btn"),
        backdrop: document.getElementById("settings-backdrop"),
        themeToggleBtn: document.getElementById("theme-toggle-btn"),
        theme: document.getElementById("setting-theme"),
        layout: document.getElementById("setting-layout"),
        defaultView: document.getElementById("setting-default-view"),
        timeFormat: document.getElementById("setting-time-format"),
        defaultSection: document.getElementById("setting-default-section"),
        toast: document.getElementById("setting-toast"),
        sound: document.getElementById("setting-sound"),
        browserNotify: document.getElementById("setting-browser-notify"),
        deviceNotify: document.getElementById("setting-device-notify"),
        resetBtn: document.getElementById("settings-reset-btn")
    };

    function syncInputs() {
        const s = app.state.settings;
        dom.theme.value = s.theme;
        dom.layout.value = s.layout;
        dom.defaultView.value = s.defaultView;
        dom.timeFormat.value = s.timeFormat;
        dom.defaultSection.value = s.defaultSection;
        dom.toast.checked = Boolean(s.toastEnabled);
        dom.sound.checked = Boolean(s.sound);
        dom.browserNotify.checked = Boolean(s.browserNotify);
        dom.deviceNotify.checked = Boolean(s.deviceNotify);
    }

    function applyVisualPreferences() {
        app.applyTheme();
        const grid = document.getElementById("faculty-grid");
        if (grid) {
            grid.classList.toggle("is-compact", app.state.settings.layout === "compact");
        }
        if (app.directory) app.directory.render();
        if (app.dashboard) app.dashboard.render();
        if (app.timetable) app.timetable.render();
    }

    function openDrawer() {
        syncInputs();
        dom.backdrop.hidden = false;
        dom.openBtn.setAttribute("aria-expanded", "true");
        dom.closeBtn.focus();
    }

    function closeDrawer() {
        dom.backdrop.hidden = true;
        dom.openBtn.setAttribute("aria-expanded", "false");
        dom.openBtn.focus();
    }

    function init() {
        app.state.viewMode = app.state.settings.defaultView || "cards";
        app.applyTheme();
        syncInputs();

        if (window.matchMedia) {
            window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
                if (app.state.settings.theme === "system") {
                    app.applyTheme();
                }
            });
        }

        dom.themeToggleBtn.addEventListener("click", () => {
            const current = app.resolveEffectiveTheme(app.state.settings.theme);
            app.state.settings.theme = current === "dark" ? "light" : "dark";
            app.saveSettings();
            syncInputs();
            app.applyTheme();
        });

        dom.openBtn.addEventListener("click", openDrawer);
        dom.closeBtn.addEventListener("click", closeDrawer);
        dom.backdrop.addEventListener("click", (e) => {
            if (e.target === dom.backdrop) closeDrawer();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && !dom.backdrop.hidden) closeDrawer();
        });

        const onChange = () => {
            app.state.settings.theme = dom.theme.value;
            app.state.settings.layout = dom.layout.value;
            app.state.settings.defaultView = dom.defaultView.value;
            app.state.settings.timeFormat = dom.timeFormat.value;
            app.state.settings.defaultSection = dom.defaultSection.value;
            app.state.settings.toastEnabled = dom.toast.checked;
            app.state.settings.sound = dom.sound.checked;
            app.state.settings.deviceNotify = dom.deviceNotify.checked;

            if (dom.browserNotify.checked && "Notification" in window && Notification.permission === "default") {
                Notification.requestPermission().then((perm) => {
                    app.state.settings.browserNotify = perm === "granted";
                    dom.browserNotify.checked = app.state.settings.browserNotify;
                    app.saveSettings();
                });
            } else {
                app.state.settings.browserNotify = dom.browserNotify.checked;
            }

            app.state.viewMode = app.state.settings.defaultView;
            app.saveSettings();
            applyVisualPreferences();
            if (app.directory) app.directory.syncViewButtons();
        };

        [dom.theme, dom.layout, dom.defaultView, dom.timeFormat, dom.defaultSection,
         dom.toast, dom.sound, dom.browserNotify, dom.deviceNotify]
            .forEach((el) => el.addEventListener("change", onChange));

        dom.resetBtn.addEventListener("click", () => {
            app.resetSettings();
            app.state.viewMode = app.state.settings.defaultView;
            syncInputs();
            applyVisualPreferences();
            if (app.directory) app.directory.syncViewButtons();
            if (app.notifications) app.notifications.showToast("Settings reset", "Restored default preferences");
        });
    }

    app.settings = {
        init,
        syncInputs,
        applyVisualPreferences
    };
})();
