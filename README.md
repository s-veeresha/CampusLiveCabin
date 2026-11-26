# Faculty Cabin Availability System — VVCE Mysuru, Dept. of CSE (AI & ML)

A real-time cabin availability, ESP32 connection monitoring, and 5th-semester timetable platform for **Vidyavardhaka College of Engineering (VVCE), Mysuru — Department of CSE (AI & ML)**.

Faculty press one of two push buttons on an ESP32 module inside their cabin (`Available` or `Not available`). The ESP32 posts the status over Wi-Fi (with automatic retries) and sends a connection heartbeat every 30 seconds. The Spring Boot backend logs updates in MySQL and pushes live updates via Server-Sent Events (SSE) to all open browsers.

---

## Project Structure

```text
Campus_Live_Cabin/
├── api/
│   └── index.mjs                  # Vercel Node.js Serverless API + SSE handler (pg + @vercel/functions)
├── database/
│   ├── schema.sql                 # Fresh MySQL install: 29 faculty, courses, timetable, admin/device tables
│   ├── migration_v2.sql           # Non-destructive MySQL upgrade for existing cabin_db installations
│   └── schema_postgres.sql        # Neon Postgres schema + seed data for cloud deployment
├── backend/
│   ├── pom.xml                    # Spring Boot 3.5.16, Java 17 (--release 17), Web, JDBC, Crypto, MySQL
│   └── src/main/
│       ├── java/com/vvce/cabin/   # App.java, controllers, services, repository, models
│       └── resources/
│           ├── application.properties
│           └── static/            # index.html, admin.html, diagnostics.html, css/, js/ modules
├── esp32/
│   ├── esp32_cabin.ino            # Arduino C++ ESP32 sketch (GPIO 13 / GPIO 27, 3 retries, 30s heartbeat)
│   └── esp32_cabin/esp32_cabin.ino
├── package.json
├── vercel.json
├── timetable_extracted.md         # Extracted 5th-sem Odd 2026-27 timetable (Sections A, B, C)
└── README.md
```

---

## Key Features

- **Public Staff Directory (`/`)**:
  - Light / Dark / System theme toggle preserving the VVCE navy, magenta, and saffron palette
  - Real-time SSE updates (`"status"`, `"device"`, `"ping"`) with auto-reconnect banner
  - Star favourites (pinned first), grid/list toggle, sort by staff order/name/designation/updated time
  - Per-card `"Notify me when available"` bell + desktop browser notifications + toast popups
  - Stale indicator (`Not updated for N hours` after 8h) and ESP32 online/offline indicator
  - Display & notification Settings drawer (`localStorage`)
  - Faculty Profile Modal showing current class, next class (Mon–Sat wrap), and mini weekly schedule
- **Dashboard Tab**:
  - KPI tiles (Total, Available, Not Available, In Class Now, Availability %, Devices Online/Offline)
  - Inline SVG Donut Chart & Availability-by-Designation bar chart (zero external chart libraries)
  - Recent Activity timeline from `status_log` and `device_log`, plus RSSI signal bars
- **Detailed Timetable Tab**:
  - Section A (`M510`), B (`M511`), C (`M509/M515`) Mon–Sat PDF layout with Tea/Lunch banded breaks
  - `BCIXX504` split elective showing all 3 faculty/rooms, Lab & Elective highlights, mobile day view
  - Faculty filter with **Free Slots** finder, **Print** CSS, and **Download CSV**
- **ESP32 Connection Monitoring**:
  - Heartbeat endpoint `POST /api/devices/{facultyId}/heartbeat` every **30 seconds** (`{"rssi": -62, "ip": "..."}`)
  - Scheduled sweep every 15 seconds marks devices silent for over **90 seconds** as offline (`device_log` + SSE `"device"` event)
- **Diagnostics (`/diagnostics` & `GET /api/ping`)**:
  - Public connectivity check (`{"ok":true,"time":"..."}`) and live trace of the last 10 `POST /api/faculty/{id}/status` requests
- **Admin Console (`/admin`)**:
  - Protected by BCrypt + 8-hour HMAC `HttpOnly` session cookie + 5-failure 5-minute lockout
  - Forced initial password change on first login
  - Faculty CRUD, manual `ADMIN` status overrides, Timetable CRUD with overlap validation, searchable Status History + CSV export, ESP32 device mapping + `device_log` history

---

## 1. Database Setup (MySQL)

### Fresh Install

```bash
mysql -u root -pvsvs < database/schema.sql
```

### Upgrading an Existing `cabin_db` Without Deleting Data

```bash
mysql -u root -pvsvs < database/migration_v2.sql
```

---

## 2. Run the Spring Boot Backend & Web UI

```bash
cd backend
mvn spring-boot:run
```

- Listens on **`0.0.0.0:8080`** in **`Asia/Kolkata` (IST)**.
- Startup logs print all detected LAN IPv4 addresses, e.g.:
  `ESP32 SERVER should be one of: http://10.252.133.95:8080`
- Public site: `http://localhost:8080`
- Diagnostics page: `http://localhost:8080/diagnostics`
- Phone connectivity ping: `http://<YOUR_PC_LAN_IP>:8080/api/ping`

---

## 3. Admin Login & Password Change

1. Open `http://localhost:8080/admin`.
2. Sign in with:
   - **Username**: `admin`
   - **Initial Password**: value of `app.admin-initial-password` in `backend/src/main/resources/application.properties` (`vvce-admin-2026` by default; hashed with BCrypt into `admin_users` on first startup).
3. On first login, the backend enforces changing the initial password before any admin management endpoint is unlocked.
4. To change the password later, sign in to `/admin` and open the **Change Password** tab.
5. Note: 5 consecutive wrong password attempts lock the admin account for 5 minutes.

---

## 4. Test Without ESP32 Hardware (`curl`)

**Update status (with `X-API-KEY`):**

```bash
curl -X POST http://localhost:8080/api/faculty/1/status ^
  -H "Content-Type: application/json" ^
  -H "X-API-KEY: vvce-cabin-2026" ^
  -d "{\"available\":true}"
```

**Simulate ESP32 heartbeat:**

```bash
curl -X POST http://localhost:8080/api/devices/1/heartbeat ^
  -H "Content-Type: application/json" ^
  -H "X-API-KEY: vvce-cabin-2026" ^
  -d "{\"rssi\":-62,\"ip\":\"10.252.133.137\"}"
```

---

## 5. PC Reachability, LAN IP & Windows Firewall (Port 8080)

1. **Find your PC's LAN IP** (e.g., on phone hotspot `"veeresh"`):
   - Run `ipconfig` in Command Prompt / PowerShell and check the Wi-Fi adapter **IPv4 Address** (or read the startup log line `ESP32 SERVER should be one of: ...`).
2. **Set Wi-Fi Network Profile to Private** (Windows):
   - Open **Settings -> Network & internet -> Wi-Fi -> \<your hotspot / network\> -> Network profile type -> Private**, or run in an **Administrator PowerShell**:
     ```powershell
     Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
     ```
3. **Allow Inbound TCP Port 8080 in Windows Firewall** (run in an **Administrator Command Prompt / PowerShell**):
   ```cmd
   netsh advfirewall firewall add rule name="VVCE Cabin Server 8080" dir=in action=allow protocol=TCP localport=8080
   ```
4. **Verify from your phone browser** (connected to the same hotspot):
   Open `http://<YOUR_PC_LAN_IP>:8080/api/ping` and confirm you see `{"ok":true,"time":"..."}`.

---

## 6. ESP32 Hardware Wiring & Flashing

### Wiring Diagram (ASCII)

```text
               +---------------------------+
               |          ESP32            |
               |                           |
   +---[ O ]---+ GPIO 13 (BTN Available)   |
   |  Button 1 |                           |
   +-----+-----+                           |
         |                                 |
   +---[ O ]---+ GPIO 27 (BTN Not Avail)   |
   |  Button 2 |                           |
   +-----+-----+                           |
         |                                 |
         +-----+ GND                       |
               +---------------------------+

Notes:
- Both push buttons use internal pull-ups (INPUT_PULLUP).
- Button 1 connects GPIO 13 to GND (Available).
- Button 2 connects GPIO 27 to GND (Not available).
```

### Flash `esp32/esp32_cabin.ino`

1. Open `esp32/esp32_cabin/esp32_cabin.ino` (or `esp32/esp32_cabin.ino`) in **Arduino IDE** with the **ESP32 by Espressif Systems** board package.
2. Verify the constants at the top:
   - `WIFI_SSID` / `WIFI_PASS` (2.4 GHz Wi-Fi / hotspot)
   - `SERVER` (`http://<YOUR_PC_LAN_IP>:8080`)
   - `FACULTY_ID` (`1..29`)
   - `API_KEY` (`vvce-cabin-2026`)
3. Upload to the ESP32 and open **Serial Monitor** at `115200` baud.
   - Button presses retry up to **3 attempts** (300 ms delay) and print the full URL, payload, HTTP code, response body, or diagnostic check hint on failure.
   - Heartbeats post every **30 seconds**; if silent for **90 seconds**, the backend marks the cabin device offline.

---

## 7. Cloud Deployment (Vercel + Neon Postgres)

For public internet hosting without keeping a local PC running 24/7, the static frontend (`backend/src/main/resources/static`) and [api/index.mjs](api/index.mjs) run on **Vercel** backed by **Neon Postgres**:

1. **Provision Neon Postgres** and run `database/schema_postgres.sql` once against the direct connection string (`psql "$DIRECT_DATABASE_URL" -f database/schema_postgres.sql`).
2. **Connect the GitHub repository on Vercel** with root settings intact (`vercel.json` serves `backend/src/main/resources/static` and routes `/api/*` to `api/index.mjs`, `/admin` to `/admin.html`, `/diagnostics` to `/diagnostics.html`).
3. **Set Vercel Environment Variables** (`Production`, `Preview`, `Development`):
   - `DATABASE_URL` — Neon **pooled** (`-pooler`) connection string with `?sslmode=verify-full`
   - `API_KEY` — shared `X-API-KEY` header expected from the ESP32 (`vvce-cabin-2026`)
   - `ADMIN_INITIAL_PASSWORD` — initial `/admin` seed password (`vvce-admin-2026`, forced change on first login)
   - `ADMIN_TOKEN_SECRET` — long random secret for HMAC session cookies
4. **ESP32 over HTTPS**: To point the hardware ESP32 directly at the live `https://<your-app>.vercel.app` URL instead of local LAN `http://<PC_IP>:8080`, update `SERVER` in `esp32/esp32_cabin.ino` to `https://<your-app>.vercel.app` and use `WiFiClientSecure` (with `setInsecure()` or the Vercel/ISRG root CA) in the sketch before flashing.
