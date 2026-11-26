import crypto from "node:crypto";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import bcrypt from "bcryptjs";

const API_KEY = process.env.API_KEY || "vvce-cabin-2026";
const ADMIN_INITIAL_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || "vvce-admin-2026";
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || "vvce-aiml-cabin-hmac-secret-2026-change-me";

const ADMIN_COOKIE_NAME = "VVCE_ADMIN_TOKEN";
const TOKEN_TTL_SECONDS = 8 * 3600;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 5;
const OFFLINE_THRESHOLD_SECONDS = 90;

const TEACHING_DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const SECTION_ROOMS = { A: "M510", B: "M511", C: "M509/M515" };
const STANDARD_PERIODS = [
  ["09:00", "10:00"],
  ["10:00", "11:00"],
  ["11:30", "12:30"],
  ["12:30", "13:30"],
  ["14:30", "15:30"],
  ["15:30", "16:30"],
  ["16:30", "18:30"]
];

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 15000,
  connectionTimeoutMillis: 10000
});
attachDatabasePool(pool);

let adminSeedPromise = null;

async function ensureAdminSeeded() {
  if (!adminSeedPromise) {
    adminSeedPromise = (async () => {
      const existing = await pool.query("SELECT id FROM admin_users WHERE username = 'admin'");
      if (existing.rows.length === 0) {
        const hash = await bcrypt.hash(ADMIN_INITIAL_PASSWORD, 10);
        await pool.query(
          "INSERT INTO admin_users (username, password_hash, must_change_password) VALUES ('admin', $1, TRUE) ON CONFLICT (username) DO NOTHING",
          [hash]
        );
      }
    })().catch((err) => {
      adminSeedPromise = null;
      throw err;
    });
  }
  return adminSeedPromise;
}

function getIstParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);

  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    dayCode: (map.weekday || "MON").slice(0, 3).toUpperCase(),
    hour: map.hour,
    minute: map.minute,
    second: map.second,
    time24: `${map.hour}:${map.minute}`,
    timeSec: `${map.hour}:${map.minute}:${map.second}`
  };
}

function formatIstIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const p = getIstParts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+05:30`;
}

function formatTime12(hhmm) {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${suffix}`;
}

function hhmmFromPgTime(t) {
  return String(t || "").slice(0, 5);
}

function classifySignal(rssi) {
  if (rssi === null || rssi === undefined) return "unknown";
  if (rssi >= -65) return "strong";
  if (rssi >= -78) return "ok";
  return "weak";
}

function toClassSlotDto(row) {
  const startTime = hhmmFromPgTime(row.start_time);
  const endTime = hhmmFromPgTime(row.end_time);
  return {
    id: Number(row.id),
    section: row.section,
    day: row.day,
    startTime,
    endTime,
    time: `${formatTime12(startTime)} - ${formatTime12(endTime)}`,
    courseCode: row.course_code,
    courseName: row.course_name,
    room: row.room,
    isLab: Boolean(row.is_lab)
  };
}

function toDeviceDto(row) {
  if (!row) return null;
  const rssi = row.rssi === null || row.rssi === undefined ? null : Number(row.rssi);
  return {
    facultyId: Number(row.faculty_id),
    facultyName: row.faculty_name,
    online: Boolean(row.online),
    lastSeen: formatIstIso(row.last_seen),
    ip: row.ip || null,
    rssi,
    signal: classifySignal(rssi),
    deviceLabel: row.device_label || null
  };
}

function findCurrentClass(slots, ist) {
  if (!slots.length || ist.dayCode === "SUN") return null;
  const match = slots.find(
    (s) => s.day === ist.dayCode && hhmmFromPgTime(s.start_time) <= ist.time24 && ist.time24 < hhmmFromPgTime(s.end_time)
  );
  return match ? toClassSlotDto(match) : null;
}

function findNextClass(slots, ist) {
  if (!slots.length) return null;
  const sorted = [...slots].sort((a, b) => {
    const da = TEACHING_DAYS.indexOf(a.day);
    const db = TEACHING_DAYS.indexOf(b.day);
    if (da !== db) return da - db;
    return hhmmFromPgTime(a.start_time).localeCompare(hhmmFromPgTime(b.start_time));
  });

  if (ist.dayCode === "SUN") return toClassSlotDto(sorted[0]);

  const laterToday = sorted.find((s) => s.day === ist.dayCode && hhmmFromPgTime(s.start_time) > ist.time24);
  if (laterToday) return toClassSlotDto(laterToday);

  const idx = TEACHING_DAYS.indexOf(ist.dayCode);
  for (let offset = 1; offset <= TEACHING_DAYS.length; offset++) {
    const candidateDay = TEACHING_DAYS[(idx + offset) % TEACHING_DAYS.length];
    const nextSlot = sorted.find((s) => s.day === candidateDay);
    if (nextSlot) return toClassSlotDto(nextSlot);
  }
  return null;
}

async function sweepStaleDevices() {
  const res = await pool.query(
    `WITH stale AS (
       UPDATE devices
       SET online = FALSE
       WHERE online = TRUE AND (last_seen IS NULL OR last_seen < NOW() - ($1 * INTERVAL '1 second'))
       RETURNING faculty_id
     )
     INSERT INTO device_log (faculty_id, event, at)
     SELECT faculty_id, 'OFFLINE', NOW() FROM stale
     RETURNING id, faculty_id`,
    [OFFLINE_THRESHOLD_SECONDS]
  );
  return res.rows;
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

function errorResponse(status, message, extraHeaders = {}) {
  return jsonResponse(
    {
      status,
      error: message,
      timestamp: formatIstIso(new Date())
    },
    status,
    extraHeaders
  );
}

function constantTimeEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function extractClientIp(request) {
  const fwd = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

function signToken(username, issuedAtSec) {
  const exp = issuedAtSec + TOKEN_TTL_SECONDS;
  const payload = Buffer.from(`${username}:${exp}`, "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", ADMIN_TOKEN_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expectedSig = crypto.createHmac("sha256", ADMIN_TOKEN_SECRET).update(parts[0]).digest("base64url");
  if (!constantTimeEquals(expectedSig, parts[1])) return null;
  try {
    const decoded = Buffer.from(parts[0], "base64url").toString("utf8");
    const idx = decoded.lastIndexOf(":");
    if (idx <= 0) return null;
    const username = decoded.slice(0, idx);
    const exp = Number(decoded.slice(idx + 1));
    if (!Number.isFinite(exp) || exp <= Math.floor(Date.now() / 1000)) return null;
    return { username, exp };
  } catch {
    return null;
  }
}

function extractAdminToken(request) {
  const auth = request.headers.get("authorization");
  if (auth && auth.startsWith("Bearer ")) return auth.slice(7).trim();
  const cookieHeader = request.headers.get("cookie") || "";
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === ADMIN_COOKIE_NAME) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

async function requireAdmin(request, allowPendingPasswordChange = false) {
  await ensureAdminSeeded();
  const token = extractAdminToken(request);
  const claims = verifyToken(token);
  if (!claims) return { error: errorResponse(401, "Admin authentication required") };
  const res = await pool.query(
    "SELECT id, username, password_hash, must_change_password, failed_attempts, locked_until FROM admin_users WHERE username = $1",
    [claims.username]
  );
  if (res.rows.length === 0) return { error: errorResponse(401, "Admin user not found") };
  const user = res.rows[0];
  if (!allowPendingPasswordChange && user.must_change_password) {
    return { error: errorResponse(403, "Password change required on first login before accessing admin actions") };
  }
  return { user };
}

async function readJsonBody(request) {
  try {
    const text = await request.text();
    if (!text.trim()) return { ok: true, data: null };
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, data: null };
  }
}

async function getFacultyDtoById(facultyId) {
  const ist = getIstParts();
  const [facRes, slotRes, devRes] = await Promise.all([
    pool.query("SELECT * FROM faculty WHERE id = $1", [facultyId]),
    pool.query(
      `SELECT t.*, c.name AS course_name FROM timetable t
       JOIN courses c ON t.course_code = c.code
       WHERE t.faculty_id = $1
       ORDER BY CASE t.day WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3 WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 ELSE 6 END, t.start_time ASC`,
      [facultyId]
    ),
    pool.query(
      `SELECT d.*, f.name AS faculty_name FROM devices d
       JOIN faculty f ON d.faculty_id = f.id
       WHERE d.faculty_id = $1`,
      [facultyId]
    )
  ]);
  if (facRes.rows.length === 0) return null;
  const f = facRes.rows[0];
  return {
    id: Number(f.id),
    name: f.name,
    designation: f.designation,
    qualification: f.qualification,
    college: f.college,
    department: f.department,
    available: Boolean(f.available),
    updatedAt: formatIstIso(f.updated_at),
    currentClass: findCurrentClass(slotRes.rows, ist),
    device: toDeviceDto(devRes.rows[0])
  };
}

async function getAllFacultyDtos() {
  const ist = getIstParts();
  const [facRes, slotRes, devRes] = await Promise.all([
    pool.query("SELECT * FROM faculty ORDER BY id ASC"),
    pool.query(
      `SELECT t.*, c.name AS course_name FROM timetable t
       JOIN courses c ON t.course_code = c.code
       WHERE t.faculty_id IS NOT NULL
       ORDER BY t.faculty_id ASC, CASE t.day WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3 WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 ELSE 6 END, t.start_time ASC`
    ),
    pool.query(
      `SELECT d.*, f.name AS faculty_name FROM devices d
       JOIN faculty f ON d.faculty_id = f.id
       ORDER BY d.faculty_id ASC`
    )
  ]);

  const slotsByFac = new Map();
  for (const s of slotRes.rows) {
    const fid = Number(s.faculty_id);
    if (!slotsByFac.has(fid)) slotsByFac.set(fid, []);
    slotsByFac.get(fid).push(s);
  }
  const devByFac = new Map();
  for (const d of devRes.rows) {
    devByFac.set(Number(d.faculty_id), toDeviceDto(d));
  }

  return facRes.rows.map((f) => {
    const id = Number(f.id);
    return {
      id,
      name: f.name,
      designation: f.designation,
      qualification: f.qualification,
      college: f.college,
      department: f.department,
      available: Boolean(f.available),
      updatedAt: formatIstIso(f.updated_at),
      currentClass: findCurrentClass(slotsByFac.get(id) || [], ist),
      device: devByFac.get(id) || null
    };
  });
}

async function recordStatusRequest(facultyId, available, sourceIp, httpStatus, detail) {
  await pool.query(
    "INSERT INTO status_request_log (faculty_id, available, source_ip, http_status, detail) VALUES ($1, $2, $3, $4, $5)",
    [facultyId, available, sourceIp, httpStatus, detail]
  );
}

async function updateFacultyStatus(facultyId, available, source, clientIp) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const upd = await client.query(
      "UPDATE faculty SET available = $1, updated_at = NOW() WHERE id = $2 RETURNING id",
      [available, facultyId]
    );
    if (upd.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    await client.query(
      "INSERT INTO status_log (faculty_id, available, source) VALUES ($1, $2, $3)",
      [facultyId, available, source]
    );
    if (source === "ESP32") {
      const knownIp = clientIp && clientIp !== "unknown" ? clientIp : null;
      const dev = await client.query("SELECT online FROM devices WHERE faculty_id = $1", [facultyId]);
      const wasOfflineOrNew = dev.rows.length === 0 || !dev.rows[0].online;
      if (dev.rows.length === 0) {
        await client.query(
          "INSERT INTO devices (faculty_id, last_seen, ip, online) VALUES ($1, NOW(), $2, TRUE)",
          [facultyId, knownIp || "unknown"]
        );
      } else {
        await client.query(
          "UPDATE devices SET last_seen = NOW(), ip = COALESCE($1, ip), online = TRUE WHERE faculty_id = $2",
          [knownIp, facultyId]
        );
      }
      if (wasOfflineOrNew) {
        await client.query("INSERT INTO device_log (faculty_id, event, at) VALUES ($1, 'ONLINE', NOW())", [facultyId]);
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getFacultyDtoById(facultyId);
}

async function getNotifications(limit) {
  const clamped = Math.max(1, Math.min(limit || 20, 100));
  const res = await pool.query(
    `SELECT event_id, event_type, faculty_id, faculty_name, available, source, device_event, event_time
     FROM (
       SELECT ('status-' || s.id::text) AS event_id,
              'STATUS' AS event_type,
              s.faculty_id,
              f.name AS faculty_name,
              s.available AS available,
              s.source AS source,
              NULL::text AS device_event,
              s.created_at AS event_time
       FROM status_log s
       JOIN faculty f ON s.faculty_id = f.id
       UNION ALL
       SELECT ('device-' || d.id::text) AS event_id,
              'DEVICE' AS event_type,
              d.faculty_id,
              f.name AS faculty_name,
              NULL::boolean AS available,
              'DEVICE' AS source,
              d.event AS device_event,
              d.at AS event_time
       FROM device_log d
       JOIN faculty f ON d.faculty_id = f.id
     ) events
     ORDER BY event_time DESC
     LIMIT $1`,
    [clamped]
  );

  return res.rows.map((r) => {
    let message;
    if (r.event_type === "DEVICE") {
      message = r.device_event === "ONLINE"
        ? `Cabin device for ${r.faculty_name} is back online`
        : `Cabin device for ${r.faculty_name} went offline`;
    } else {
      const label = r.available ? "Available" : "Not available";
      message = r.source === "ADMIN"
        ? `${r.faculty_name} set to ${label} by admin`
        : `${r.faculty_name} is now ${label}`;
    }
    return {
      id: r.event_id,
      type: r.event_type,
      facultyId: Number(r.faculty_id),
      facultyName: r.faculty_name,
      available: r.available,
      source: r.source,
      deviceEvent: r.device_event,
      message,
      createdAt: formatIstIso(r.event_time)
    };
  });
}

function handleSseStream(request) {
  const encoder = new TextEncoder();
  let timer = null;
  let closeTimer = null;
  let lastStatusId = 0;
  let lastDeviceLogId = 0;
  let lastPingAt = Date.now();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const sendFrame = (eventName, payload) => {
        if (closed) return;
        const body = typeof payload === "string" ? payload : JSON.stringify(payload);
        controller.enqueue(encoder.encode(`event:${eventName}\ndata:${body}\n\n`));
      };

      sendFrame("ping", "connected");

      try {
        const [sMax, dMax] = await Promise.all([
          pool.query("SELECT COALESCE(MAX(id), 0)::bigint AS id FROM status_log"),
          pool.query("SELECT COALESCE(MAX(id), 0)::bigint AS id FROM device_log")
        ]);
        lastStatusId = Number(sMax.rows[0].id);
        lastDeviceLogId = Number(dMax.rows[0].id);
      } catch {
        // Continue with 0 baseline if DB query fails briefly.
      }

      const poll = async () => {
        if (closed) return;
        try {
          await sweepStaleDevices();
          const [newStatuses, newDeviceLogs] = await Promise.all([
            pool.query("SELECT id, faculty_id FROM status_log WHERE id > $1 ORDER BY id ASC", [lastStatusId]),
            pool.query("SELECT id, faculty_id FROM device_log WHERE id > $1 ORDER BY id ASC", [lastDeviceLogId])
          ]);

          for (const row of newStatuses.rows) {
            lastStatusId = Math.max(lastStatusId, Number(row.id));
            const dto = await getFacultyDtoById(Number(row.faculty_id));
            if (dto) sendFrame("status", dto);
          }
          for (const row of newDeviceLogs.rows) {
            lastDeviceLogId = Math.max(lastDeviceLogId, Number(row.id));
            const devRes = await pool.query(
              "SELECT d.*, f.name AS faculty_name FROM devices d JOIN faculty f ON d.faculty_id = f.id WHERE d.faculty_id = $1",
              [Number(row.faculty_id)]
            );
            if (devRes.rows.length) sendFrame("device", toDeviceDto(devRes.rows[0]));
          }

          if (Date.now() - lastPingAt >= 20000) {
            lastPingAt = Date.now();
            sendFrame("ping", { ts: formatIstIso(new Date()) });
          }
        } catch {
          // Ignore transient DB poll errors in stream loop.
        }
      };

      timer = setInterval(poll, 2000);
      closeTimer = setTimeout(() => {
        closed = true;
        clearInterval(timer);
        try { controller.close(); } catch {}
      }, 240000);

      request.signal?.addEventListener("abort", () => {
        closed = true;
        clearInterval(timer);
        clearTimeout(closeTimer);
        try { controller.close(); } catch {}
      });
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
      if (closeTimer) clearTimeout(closeTimer);
    }
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Pragma": "no-cache",
      "X-Accel-Buffering": "no",
      "Connection": "keep-alive"
    }
  });
}

function cookieHeaderForToken(token, maxAgeSec, request) {
  const isHttps = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const secure = isHttps ? "; Secure" : "";
  return `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const path = url.pathname;
      const method = request.method.toUpperCase();

      if (method === "GET" && path === "/api/ping") {
        return jsonResponse({ ok: true, time: formatIstIso(new Date()) });
      }

      if (method === "GET" && path === "/api/stream") {
        return handleSseStream(request);
      }

      if (method === "GET" && path === "/api/diagnostics") {
        let dbOk = false;
        let lastChange = null;
        let recentRequests = [];
        try {
          await pool.query("SELECT 1");
          dbOk = true;
          const [lastRes, reqRes] = await Promise.all([
            pool.query("SELECT created_at FROM status_log ORDER BY created_at DESC, id DESC LIMIT 1"),
            pool.query("SELECT time, faculty_id, available, source_ip, http_status, detail FROM status_request_log ORDER BY id DESC LIMIT 10")
          ]);
          if (lastRes.rows.length) lastChange = formatIstIso(lastRes.rows[0].created_at);
          recentRequests = reqRes.rows.map((r) => ({
            time: formatIstIso(r.time),
            facultyId: Number(r.faculty_id),
            available: r.available,
            sourceIp: r.source_ip,
            httpStatus: Number(r.http_status),
            detail: r.detail
          }));
        } catch {
          dbOk = false;
        }
        return jsonResponse({
          backendOk: true,
          databaseOk: dbOk,
          serverTimeIst: formatIstIso(new Date()),
          sseClientCount: 0,
          lastStatusChangeTime: lastChange,
          lanUrls: [url.origin],
          recentRequests
        });
      }

      if (method === "GET" && path === "/api/faculty") {
        await sweepStaleDevices();
        return jsonResponse(await getAllFacultyDtos());
      }

      let m = path.match(/^\/api\/faculty\/(\d+)$/);
      if (method === "GET" && m) {
        await sweepStaleDevices();
        const dto = await getFacultyDtoById(Number(m[1]));
        return dto ? jsonResponse(dto) : errorResponse(404, `Faculty not found for id ${m[1]}`);
      }

      m = path.match(/^\/api\/faculty\/(\d+)\/status$/);
      if (method === "POST" && m) {
        const facultyId = Number(m[1]);
        const clientIp = extractClientIp(request);
        const providedKey = request.headers.get("x-api-key");
        if (!constantTimeEquals(providedKey, API_KEY)) {
          await recordStatusRequest(facultyId, null, clientIp, 401, "Invalid or missing X-API-KEY");
          return errorResponse(401, "Invalid or missing X-API-KEY header");
        }
        const parsed = await readJsonBody(request);
        if (!parsed.ok) {
          await recordStatusRequest(facultyId, null, clientIp, 400, "Malformed JSON request body");
          return errorResponse(400, "Malformed JSON request body");
        }
        if (!parsed.data || typeof parsed.data.available !== "boolean") {
          await recordStatusRequest(facultyId, null, clientIp, 400, "Missing boolean field 'available'");
          return errorResponse(400, "Request body must contain boolean field 'available'");
        }
        const updated = await updateFacultyStatus(facultyId, parsed.data.available, "ESP32", clientIp);
        if (!updated) {
          await recordStatusRequest(facultyId, parsed.data.available, clientIp, 404, `Faculty not found for id ${facultyId}`);
          return errorResponse(404, `Faculty not found for id ${facultyId}`);
        }
        await recordStatusRequest(facultyId, parsed.data.available, clientIp, 200, "Updated via ESP32");
        return jsonResponse(updated);
      }

      m = path.match(/^\/api\/faculty\/(\d+)\/timetable$/);
      if (method === "GET" && m) {
        const facultyId = Number(m[1]);
        const facRes = await pool.query("SELECT id, name, designation, department FROM faculty WHERE id = $1", [facultyId]);
        if (facRes.rows.length === 0) return errorResponse(404, `Faculty not found for id ${facultyId}`);
        const slotsRes = await pool.query(
          `SELECT t.*, c.name AS course_name FROM timetable t
           JOIN courses c ON t.course_code = c.code
           WHERE t.faculty_id = $1
           ORDER BY CASE t.day WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3 WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 ELSE 6 END, t.start_time ASC, t.section ASC`,
          [facultyId]
        );
        const f = facRes.rows[0];
        return jsonResponse({
          facultyId: Number(f.id),
          facultyName: f.name,
          designation: f.designation,
          department: f.department,
          classes: slotsRes.rows.map(toClassSlotDto)
        });
      }

      m = path.match(/^\/api\/faculty\/(\d+)\/now$/);
      if (method === "GET" && m) {
        const facultyId = Number(m[1]);
        const facRes = await pool.query("SELECT id, name, available FROM faculty WHERE id = $1", [facultyId]);
        if (facRes.rows.length === 0) return errorResponse(404, `Faculty not found for id ${facultyId}`);
        const slotsRes = await pool.query(
          `SELECT t.*, c.name AS course_name FROM timetable t
           JOIN courses c ON t.course_code = c.code
           WHERE t.faculty_id = $1
           ORDER BY CASE t.day WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3 WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 ELSE 6 END, t.start_time ASC`,
          [facultyId]
        );
        const ist = getIstParts();
        const f = facRes.rows[0];
        return jsonResponse({
          facultyId: Number(f.id),
          facultyName: f.name,
          available: Boolean(f.available),
          currentDay: ist.dayCode,
          currentTimeIst: ist.timeSec,
          currentClass: findCurrentClass(slotsRes.rows, ist),
          nextClass: findNextClass(slotsRes.rows, ist)
        });
      }

      if (method === "GET" && path === "/api/notifications") {
        await sweepStaleDevices();
        const limit = Number(url.searchParams.get("limit") || "20");
        return jsonResponse(await getNotifications(limit));
      }

      if (method === "GET" && path === "/api/timetable") {
        const sec = (url.searchParams.get("section") || "A").trim().toUpperCase();
        if (!SECTION_ROOMS[sec]) return errorResponse(400, "Section must be A, B, or C");
        const res = await pool.query(
          `SELECT t.id, t.section, t.day, t.start_time, t.end_time,
                  t.course_code, c.name AS course_name,
                  t.faculty_id, f.name AS faculty_name, t.room, t.is_lab
           FROM timetable t
           JOIN courses c ON t.course_code = c.code
           LEFT JOIN faculty f ON t.faculty_id = f.id
           WHERE t.section = $1 OR t.section = 'ALL'
           ORDER BY CASE t.day WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3 WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 ELSE 6 END,
                    t.start_time ASC, t.faculty_id ASC`,
          [sec]
        );
        const slots = [];
        const legendMap = new Map();
        for (const r of res.rows) {
          const start24 = hhmmFromPgTime(r.start_time);
          if (r.section === "ALL" && r.course_code === "BCIXX504") {
            if (sec === "A" && r.day === "THU" && start24 === "14:30") continue;
            if (sec !== "A" && r.day === "WED" && start24 === "14:30") continue;
          }
          const end24 = hhmmFromPgTime(r.end_time);
          slots.push({
            id: Number(r.id),
            section: r.section,
            day: r.day,
            startTime: start24,
            endTime: end24,
            time: `${formatTime12(start24)} - ${formatTime12(end24)}`,
            courseCode: r.course_code,
            courseName: r.course_name,
            facultyId: r.faculty_id === null ? null : Number(r.faculty_id),
            facultyName: r.faculty_name,
            room: r.room,
            isLab: Boolean(r.is_lab)
          });
          if (!legendMap.has(r.course_code)) {
            legendMap.set(r.course_code, { code: r.course_code, name: r.course_name, isLab: Boolean(r.is_lab), faculty: new Set() });
          }
          if (r.faculty_name) {
            const label = r.section === "ALL" && r.room ? `${r.faculty_name} (${r.room})` : r.faculty_name;
            legendMap.get(r.course_code).faculty.add(label);
          }
        }
        const legend = Array.from(legendMap.values()).map((x) => ({
          courseCode: x.code,
          courseName: x.name,
          facultySummary: x.faculty.size ? Array.from(x.faculty).join(", ") : "—",
          isLab: x.isLab
        }));
        return jsonResponse({
          section: sec,
          defaultRoom: SECTION_ROOMS[sec],
          academicTerm: "Odd Semester 2026-27",
          version: "Version 1.0",
          effectiveDate: "04-09-2026",
          slots,
          legend
        });
      }

      if (method === "GET" && path === "/api/timetable/free") {
        const facultyId = Number(url.searchParams.get("facultyId"));
        if (!facultyId) return errorResponse(400, "facultyId is required");
        const facRes = await pool.query("SELECT id, name, designation FROM faculty WHERE id = $1", [facultyId]);
        if (facRes.rows.length === 0) return errorResponse(404, `Faculty not found for id ${facultyId}`);
        const slotsRes = await pool.query(
          `SELECT t.*, c.name AS course_name FROM timetable t
           JOIN courses c ON t.course_code = c.code
           WHERE t.faculty_id = $1
           ORDER BY CASE t.day WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3 WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 ELSE 6 END, t.start_time ASC`,
          [facultyId]
        );
        const busyRows = slotsRes.rows;
        const freeSlots = [];
        for (const day of TEACHING_DAYS) {
          for (const [start, end] of STANDARD_PERIODS) {
            const overlaps = busyRows.some(
              (s) => s.day === day && hhmmFromPgTime(s.start_time) < end && hhmmFromPgTime(s.end_time) > start
            );
            if (!overlaps) {
              freeSlots.push({ day, startTime: start, endTime: end, time: `${formatTime12(start)} - ${formatTime12(end)}` });
            }
          }
        }
        const f = facRes.rows[0];
        return jsonResponse({
          facultyId: Number(f.id),
          facultyName: f.name,
          designation: f.designation,
          busySlots: busyRows.map(toClassSlotDto),
          freeSlots
        });
      }

      if (method === "GET" && path === "/api/devices") {
        await sweepStaleDevices();
        const res = await pool.query(
          `SELECT d.*, f.name AS faculty_name FROM devices d
           JOIN faculty f ON d.faculty_id = f.id
           ORDER BY d.faculty_id ASC`
        );
        return jsonResponse(res.rows.map(toDeviceDto));
      }

      m = path.match(/^\/api\/devices\/(\d+)\/heartbeat$/);
      if (method === "POST" && m) {
        const providedKey = request.headers.get("x-api-key");
        if (!constantTimeEquals(providedKey, API_KEY)) {
          return errorResponse(401, "Invalid or missing X-API-KEY header");
        }
        const facultyId = Number(m[1]);
        const facRes = await pool.query("SELECT id, name FROM faculty WHERE id = $1", [facultyId]);
        if (facRes.rows.length === 0) return errorResponse(404, `Faculty not found for id ${facultyId}`);
        const parsed = await readJsonBody(request);
        if (!parsed.ok) return errorResponse(400, "Malformed JSON request body");

        const body = parsed.data || {};
        const rawIp = body.ip && String(body.ip).trim() ? String(body.ip).trim() : extractClientIp(request);
        const knownIp = rawIp && rawIp !== "unknown" ? rawIp : null;
        const rssi = Number.isInteger(body.rssi) ? body.rssi : null;

        const existing = await pool.query("SELECT online FROM devices WHERE faculty_id = $1", [facultyId]);
        const wasOfflineOrNew = existing.rows.length === 0 || !existing.rows[0].online;
        if (existing.rows.length === 0) {
          await pool.query(
            "INSERT INTO devices (faculty_id, last_seen, ip, rssi, online) VALUES ($1, NOW(), $2, $3, TRUE)",
            [facultyId, knownIp || "unknown", rssi]
          );
        } else {
          await pool.query(
            "UPDATE devices SET last_seen = NOW(), ip = COALESCE($1, ip), rssi = COALESCE($2, rssi), online = TRUE WHERE faculty_id = $3",
            [knownIp, rssi, facultyId]
          );
        }
        if (wasOfflineOrNew) {
          await pool.query("INSERT INTO device_log (faculty_id, event, at) VALUES ($1, 'ONLINE', NOW())", [facultyId]);
        }
        const devRes = await pool.query(
          "SELECT d.*, f.name AS faculty_name FROM devices d JOIN faculty f ON d.faculty_id = f.id WHERE d.faculty_id = $1",
          [facultyId]
        );
        return jsonResponse(toDeviceDto(devRes.rows[0]));
      }

      // ===== ADMIN ENDPOINTS =====
      if (method === "POST" && path === "/api/admin/login") {
        await ensureAdminSeeded();
        const parsed = await readJsonBody(request);
        if (!parsed.ok || !parsed.data || !parsed.data.username || !parsed.data.password) {
          return errorResponse(400, "Username and password are required");
        }
        const res = await pool.query("SELECT * FROM admin_users WHERE username = $1", [String(parsed.data.username).trim()]);
        if (res.rows.length === 0) return errorResponse(401, "Invalid username or password");
        const user = res.rows[0];

        if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
          return errorResponse(429, "Account temporarily locked after 5 failed attempts. Try again after 5 minutes.");
        }

        const ok = await bcrypt.compare(String(parsed.data.password), user.password_hash);
        if (!ok) {
          const nextAttempts = Number(user.failed_attempts) + 1;
          if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
            await pool.query(
              "UPDATE admin_users SET failed_attempts = $1, locked_until = NOW() + ($2 * INTERVAL '1 minute') WHERE id = $3",
              [nextAttempts, LOCK_MINUTES, user.id]
            );
            return errorResponse(429, "Too many failed logins. Account locked for 5 minutes.");
          }
          await pool.query("UPDATE admin_users SET failed_attempts = $1 WHERE id = $2", [nextAttempts, user.id]);
          return errorResponse(401, "Invalid username or password");
        }

        if (user.failed_attempts !== 0 || user.locked_until !== null) {
          await pool.query("UPDATE admin_users SET failed_attempts = 0, locked_until = NULL WHERE id = $1", [user.id]);
        }
        const nowSec = Math.floor(Date.now() / 1000);
        const token = signToken(user.username, nowSec);
        return jsonResponse(
          {
            authenticated: true,
            username: user.username,
            mustChangePassword: Boolean(user.must_change_password),
            expiresAt: formatIstIso(new Date((nowSec + TOKEN_TTL_SECONDS) * 1000))
          },
          200,
          { "Set-Cookie": cookieHeaderForToken(token, TOKEN_TTL_SECONDS, request) }
        );
      }

      if (method === "POST" && path === "/api/admin/logout") {
        return jsonResponse({ loggedOut: true }, 200, { "Set-Cookie": cookieHeaderForToken("", 0, request) });
      }

      if (method === "GET" && path === "/api/admin/me") {
        const auth = await requireAdmin(request, true);
        if (auth.error) return auth.error;
        return jsonResponse({
          authenticated: true,
          username: auth.user.username,
          mustChangePassword: Boolean(auth.user.must_change_password)
        });
      }

      if (method === "POST" && path === "/api/admin/change-password") {
        const auth = await requireAdmin(request, true);
        if (auth.error) return auth.error;
        const parsed = await readJsonBody(request);
        const cur = parsed.data?.currentPassword;
        const nw = parsed.data?.newPassword;
        if (!cur || !nw || String(nw).length < 8) {
          return errorResponse(400, "New password must be at least 8 characters long");
        }
        if (!(await bcrypt.compare(String(cur), auth.user.password_hash))) {
          return errorResponse(401, "Current password is incorrect");
        }
        if (await bcrypt.compare(String(nw), auth.user.password_hash)) {
          return errorResponse(400, "New password must differ from current password");
        }
        const newHash = await bcrypt.hash(String(nw), 10);
        await pool.query(
          "UPDATE admin_users SET password_hash = $1, must_change_password = FALSE, failed_attempts = 0, locked_until = NULL, updated_at = NOW() WHERE id = $2",
          [newHash, auth.user.id]
        );
        return jsonResponse({ changed: true });
      }

      if (path.startsWith("/api/admin/")) {
        const auth = await requireAdmin(request, false);
        if (auth.error) return auth.error;

        if (method === "GET" && path === "/api/admin/faculty") {
          await sweepStaleDevices();
          return jsonResponse(await getAllFacultyDtos());
        }

        if (method === "POST" && path === "/api/admin/faculty") {
          const parsed = await readJsonBody(request);
          const d = parsed.data;
          if (!d?.name?.trim() || !d?.designation?.trim() || !d?.qualification?.trim()) {
            return errorResponse(400, "Name, designation, and qualification are required");
          }
          const dept = d.department?.trim() || "CSE (AI & ML)";
          const maxRes = await pool.query("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM faculty");
          const nextId = Number(maxRes.rows[0].next_id);
          await pool.query(
            "INSERT INTO faculty (id, name, designation, qualification, department) VALUES ($1, $2, $3, $4, $5)",
            [nextId, d.name.trim(), d.designation.trim(), d.qualification.trim(), dept]
          );
          return jsonResponse(await getFacultyDtoById(nextId));
        }

        m = path.match(/^\/api\/admin\/faculty\/(\d+)$/);
        if (method === "PUT" && m) {
          const id = Number(m[1]);
          const parsed = await readJsonBody(request);
          const d = parsed.data;
          if (!d?.name?.trim() || !d?.designation?.trim() || !d?.qualification?.trim()) {
            return errorResponse(400, "Name, designation, and qualification are required");
          }
          const dept = d.department?.trim() || "CSE (AI & ML)";
          const upd = await pool.query(
            "UPDATE faculty SET name = $1, designation = $2, qualification = $3, department = $4 WHERE id = $5 RETURNING id",
            [d.name.trim(), d.designation.trim(), d.qualification.trim(), dept, id]
          );
          if (upd.rows.length === 0) return errorResponse(404, `Faculty not found for id ${id}`);
          return jsonResponse(await getFacultyDtoById(id));
        }

        if (method === "DELETE" && m) {
          const id = Number(m[1]);
          const client = await pool.connect();
          try {
            await client.query("BEGIN");
            await client.query("UPDATE timetable SET faculty_id = NULL WHERE faculty_id = $1", [id]);
            await client.query("DELETE FROM status_log WHERE faculty_id = $1", [id]);
            await client.query("DELETE FROM device_log WHERE faculty_id = $1", [id]);
            await client.query("DELETE FROM devices WHERE faculty_id = $1", [id]);
            const del = await client.query("DELETE FROM faculty WHERE id = $1 RETURNING id", [id]);
            await client.query("COMMIT");
            if (del.rows.length === 0) return errorResponse(404, `Faculty not found for id ${id}`);
            return jsonResponse({ deleted: true, id });
          } catch (err) {
            await client.query("ROLLBACK");
            throw err;
          } finally {
            client.release();
          }
        }

        m = path.match(/^\/api\/admin\/faculty\/(\d+)\/status$/);
        if (method === "POST" && m) {
          const parsed = await readJsonBody(request);
          if (!parsed.data || typeof parsed.data.available !== "boolean") {
            return errorResponse(400, "Field 'available' is required");
          }
          const updated = await updateFacultyStatus(Number(m[1]), parsed.data.available, "ADMIN", extractClientIp(request));
          return updated ? jsonResponse(updated) : errorResponse(404, `Faculty not found for id ${m[1]}`);
        }

        if (method === "GET" && path === "/api/admin/courses") {
          const res = await pool.query("SELECT code, name FROM courses ORDER BY code ASC");
          return jsonResponse(res.rows);
        }

        if (method === "GET" && path === "/api/admin/timetable") {
          const res = await pool.query(
            `SELECT t.*, c.name AS course_name, f.name AS faculty_name
             FROM timetable t
             JOIN courses c ON t.course_code = c.code
             LEFT JOIN faculty f ON t.faculty_id = f.id
             ORDER BY CASE t.section WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END,
                      CASE t.day WHEN 'MON' THEN 1 WHEN 'TUE' THEN 2 WHEN 'WED' THEN 3 WHEN 'THU' THEN 4 WHEN 'FRI' THEN 5 ELSE 6 END,
                      t.start_time ASC, t.id ASC`
          );
          return jsonResponse(res.rows.map((r) => ({
            id: Number(r.id),
            section: r.section,
            day: r.day,
            startTime: hhmmFromPgTime(r.start_time),
            endTime: hhmmFromPgTime(r.end_time),
            courseCode: r.course_code,
            courseName: r.course_name,
            facultyId: r.faculty_id === null ? null : Number(r.faculty_id),
            facultyName: r.faculty_name,
            room: r.room,
            isLab: Boolean(r.is_lab)
          })));
        }

        if ((method === "POST" && path === "/api/admin/timetable") || (method === "PUT" && /^\/api\/admin\/timetable\/\d+$/.test(path))) {
          const editId = method === "PUT" ? Number(path.split("/").pop()) : null;
          const parsed = await readJsonBody(request);
          const d = parsed.data;
          if (!d?.section || !d?.day || !d?.startTime || !d?.endTime || !d?.courseCode) {
            return errorResponse(400, "section, day, startTime, endTime, and courseCode are required");
          }
          const section = String(d.section).trim().toUpperCase();
          const day = String(d.day).trim().toUpperCase();
          const courseCode = String(d.courseCode).trim().toUpperCase();
          const startTime = String(d.startTime).trim().slice(0, 5);
          const endTime = String(d.endTime).trim().slice(0, 5);
          if (!["A", "B", "C", "ALL"].includes(section)) return errorResponse(400, "Section must be A, B, C, or ALL");
          if (!TEACHING_DAYS.includes(day)) return errorResponse(400, "Day must be MON..SAT");
          if (startTime >= endTime) return errorResponse(400, "startTime must be before endTime");

          const courseRes = await pool.query("SELECT 1 FROM courses WHERE code = $1", [courseCode]);
          if (courseRes.rows.length === 0) return errorResponse(400, `Unknown course code: ${courseCode}`);

          const facultyId = d.facultyId ? Number(d.facultyId) : null;
          if (facultyId !== null) {
            const facCheck = await pool.query("SELECT 1 FROM faculty WHERE id = $1", [facultyId]);
            if (facCheck.rows.length === 0) return errorResponse(400, `Unknown facultyId: ${facultyId}`);
            const overlapRes = await pool.query(
              `SELECT id, section, day, start_time, end_time, course_code
               FROM timetable
               WHERE faculty_id = $1 AND day = $2
                 AND ($3::int IS NULL OR id <> $3)
                 AND start_time < $5::time AND end_time > $4::time
               LIMIT 1`,
              [facultyId, day, editId, `${startTime}:00`, `${endTime}:00`]
            );
            if (overlapRes.rows.length > 0) {
              const c = overlapRes.rows[0];
              return errorResponse(409, `Faculty already has ${c.course_code} (Sec ${c.section}) on ${c.day} from ${hhmmFromPgTime(c.start_time)} to ${hhmmFromPgTime(c.end_time)}`);
            }
          }

          const room = d.room && String(d.room).trim() ? String(d.room).trim() : null;
          const isLab = Boolean(d.isLab);
          let slotId;
          if (editId) {
            const upd = await pool.query(
              `UPDATE timetable SET section = $1, day = $2, start_time = $3::time, end_time = $4::time,
               course_code = $5, faculty_id = $6, room = $7, is_lab = $8 WHERE id = $9 RETURNING id`,
              [section, day, `${startTime}:00`, `${endTime}:00`, courseCode, facultyId, room, isLab, editId]
            );
            if (upd.rows.length === 0) return errorResponse(404, `Timetable slot not found for id ${editId}`);
            slotId = editId;
          } else {
            const ins = await pool.query(
              `INSERT INTO timetable (section, day, start_time, end_time, course_code, faculty_id, room, is_lab)
               VALUES ($1, $2, $3::time, $4::time, $5, $6, $7, $8) RETURNING id`,
              [section, day, `${startTime}:00`, `${endTime}:00`, courseCode, facultyId, room, isLab]
            );
            slotId = Number(ins.rows[0].id);
          }
          const full = await pool.query(
            `SELECT t.*, c.name AS course_name, f.name AS faculty_name
             FROM timetable t JOIN courses c ON t.course_code = c.code LEFT JOIN faculty f ON t.faculty_id = f.id
             WHERE t.id = $1`,
            [slotId]
          );
          const r = full.rows[0];
          return jsonResponse({
            id: Number(r.id),
            section: r.section,
            day: r.day,
            startTime: hhmmFromPgTime(r.start_time),
            endTime: hhmmFromPgTime(r.end_time),
            courseCode: r.course_code,
            courseName: r.course_name,
            facultyId: r.faculty_id === null ? null : Number(r.faculty_id),
            facultyName: r.faculty_name,
            room: r.room,
            isLab: Boolean(r.is_lab)
          });
        }

        m = path.match(/^\/api\/admin\/timetable\/(\d+)$/);
        if (method === "DELETE" && m) {
          const del = await pool.query("DELETE FROM timetable WHERE id = $1 RETURNING id", [Number(m[1])]);
          if (del.rows.length === 0) return errorResponse(404, `Timetable slot not found for id ${m[1]}`);
          return jsonResponse({ deleted: true, id: Number(m[1]) });
        }

        if (method === "GET" && (path === "/api/admin/logs" || path === "/api/admin/logs/export")) {
          const search = url.searchParams.get("search")?.trim().toLowerCase() || "";
          const source = url.searchParams.get("source")?.trim().toUpperCase() || "";
          const fromDate = url.searchParams.get("fromDate")?.trim() || "";
          const toDate = url.searchParams.get("toDate")?.trim() || "";
          const limit = path.endsWith("/export") ? 1000 : Math.max(1, Math.min(Number(url.searchParams.get("limit") || "200"), 1000));

          const where = [];
          const params = [];
          if (search) {
            params.push(`%${search}%`);
            where.push(`LOWER(f.name) LIKE $${params.length}`);
          }
          if (source && source !== "ALL") {
            params.push(source);
            where.push(`s.source = $${params.length}`);
          }
          if (fromDate) {
            params.push(fromDate);
            where.push(`(s.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $${params.length}::date`);
          }
          if (toDate) {
            params.push(toDate);
            where.push(`(s.created_at AT TIME ZONE 'Asia/Kolkata')::date <= $${params.length}::date`);
          }
          params.push(limit);
          const sql = `SELECT s.id, s.faculty_id, f.name AS faculty_name, s.available, s.source, s.created_at
                       FROM status_log s JOIN faculty f ON s.faculty_id = f.id
                       ${where.length ? "WHERE " + where.join(" AND ") : ""}
                       ORDER BY s.created_at DESC, s.id DESC LIMIT $${params.length}`;
          const res = await pool.query(sql, params);
          const logs = res.rows.map((r) => ({
            id: Number(r.id),
            facultyId: Number(r.faculty_id),
            facultyName: r.faculty_name,
            available: Boolean(r.available),
            source: r.source,
            createdAt: formatIstIso(r.created_at)
          }));

          if (path.endsWith("/export")) {
            const lines = ["ID,Faculty ID,Faculty Name,Available,Source,Created At (IST)"];
            for (const row of logs) {
              lines.push(`${row.id},${row.facultyId},"${row.facultyName.replaceAll('"', '""')}",${row.available ? "Available" : "Not available"},${row.source},${row.createdAt || ""}`);
            }
            return new Response(lines.join("\n") + "\n", {
              status: 200,
              headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": 'attachment; filename="status_logs.csv"'
              }
            });
          }
          return jsonResponse(logs);
        }

        if (method === "GET" && path === "/api/admin/devices") {
          await sweepStaleDevices();
          const res = await pool.query(
            "SELECT d.*, f.name AS faculty_name FROM devices d JOIN faculty f ON d.faculty_id = f.id ORDER BY d.faculty_id ASC"
          );
          return jsonResponse(res.rows.map(toDeviceDto));
        }

        m = path.match(/^\/api\/admin\/devices\/(\d+)\/label$/);
        if (method === "PUT" && m) {
          const facultyId = Number(m[1]);
          const facCheck = await pool.query("SELECT 1 FROM faculty WHERE id = $1", [facultyId]);
          if (facCheck.rows.length === 0) return errorResponse(404, `Faculty not found for id ${facultyId}`);
          const parsed = await readJsonBody(request);
          const label = parsed.data?.deviceLabel?.trim() || null;
          await pool.query(
            `INSERT INTO devices (faculty_id, online, device_label) VALUES ($1, FALSE, $2)
             ON CONFLICT (faculty_id) DO UPDATE SET device_label = EXCLUDED.device_label`,
            [facultyId, label]
          );
          return jsonResponse({ updated: true, facultyId });
        }

        if (method === "GET" && path === "/api/admin/devices/logs") {
          const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || "100"), 500));
          const res = await pool.query(
            `SELECT d.id, d.faculty_id, f.name AS faculty_name, d.event, d.at
             FROM device_log d JOIN faculty f ON d.faculty_id = f.id
             ORDER BY d.at DESC, d.id DESC LIMIT $1`,
            [limit]
          );
          return jsonResponse(res.rows.map((r) => ({
            id: Number(r.id),
            facultyId: Number(r.faculty_id),
            facultyName: r.faculty_name,
            event: r.event,
            at: formatIstIso(r.at)
          })));
        }
      }

      return errorResponse(404, `No endpoint matches ${method} ${path}`);
    } catch (err) {
      console.error("[API ERROR]", err);
      return errorResponse(500, "Internal server error");
    }
  }
};
