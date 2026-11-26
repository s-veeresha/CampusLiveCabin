#include <WiFi.h>
#include <HTTPClient.h>

// ===================== CONFIGURATION =====================
const char* WIFI_SSID   = "veeresh";
const char* WIFI_PASS   = "12345678";
const char* SERVER      = "http://10.252.133.95:8080";
const int   FACULTY_ID  = 4;
const char* API_KEY     = "vvce-cabin-2026";
// =========================================================

const int BTN_AVAILABLE_PIN   = 13; // Push button 1: Available (to GND)
const int BTN_UNAVAILABLE_PIN = 27; // Push button 2: Not available (to GND)

const unsigned long DEBOUNCE_MS            = 40;
const unsigned long WIFI_RETRY_INTERVAL_MS = 5000;
const unsigned long HEARTBEAT_INTERVAL_MS  = 30000;
const int           MAX_STATUS_ATTEMPTS    = 3;
const unsigned long RETRY_DELAY_MS         = 300;

unsigned long lastWifiAttemptMs = 0;
unsigned long lastHeartbeatMs   = 0;

struct PushButton {
  int pin;
  bool targetAvailability;
  const char* label;
};

PushButton buttons[] = {
  { BTN_AVAILABLE_PIN,   true,  "Available"     },
  { BTN_UNAVAILABLE_PIN, false, "Not available" }
};

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long startMs = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startMs < 15000) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] Connected! ESP32 IP: ");
    Serial.println(WiFi.localIP());
    Serial.printf("[WiFi] RSSI: %d dBm\n", WiFi.RSSI());
  } else {
    Serial.println("[WiFi] Connection timed out. Will retry automatically.");
  }
}

void ensureWiFiConnected() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }
  unsigned long now = millis();
  if (now - lastWifiAttemptMs >= WIFI_RETRY_INTERVAL_MS) {
    lastWifiAttemptMs = now;
    Serial.println("[WiFi] Disconnected. Attempting reconnect...");
    WiFi.disconnect();
    connectWiFi();
    if (WiFi.status() == WL_CONNECTED) {
      lastHeartbeatMs = 0; // Send fresh heartbeat right after reconnect
    }
  }
}

bool sendAvailabilityStatus(bool available) {
  ensureWiFiConnected();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP] Aborted: Wi-Fi is not connected.");
    Serial.println("Check: PC IP in SERVER, same Wi-Fi, firewall port 8080");
    return false;
  }

  String url = String(SERVER) + "/api/faculty/" + String(FACULTY_ID) + "/status";
  String payload = available ? "{\"available\":true}" : "{\"available\":false}";

  for (int attempt = 1; attempt <= MAX_STATUS_ATTEMPTS; attempt++) {
    HTTPClient http;
    http.setTimeout(5000);
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-KEY", API_KEY);

    Serial.printf("[HTTP] Attempt %d/%d POST %s | Payload: %s\n",
                  attempt, MAX_STATUS_ATTEMPTS, url.c_str(), payload.c_str());

    int httpCode = http.POST(payload);
    if (httpCode > 0) {
      String response = http.getString();
      Serial.printf("[HTTP] Response code: %d | Body: %s\n", httpCode, response.c_str());
      http.end();
      if (httpCode >= 200 && httpCode < 300) {
        return true;
      }
      Serial.printf("[HTTP] Attempt %d failed with HTTP %d\n", attempt, httpCode);
    } else {
      Serial.printf("[HTTP] Attempt %d failed, error: %s\n",
                    attempt, http.errorToString(httpCode).c_str());
      http.end();
    }

    if (attempt < MAX_STATUS_ATTEMPTS) {
      delay(RETRY_DELAY_MS);
    }
  }

  Serial.println("Check: PC IP in SERVER, same Wi-Fi, firewall port 8080");
  return false;
}

void sendHeartbeat() {
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  String url = String(SERVER) + "/api/devices/" + String(FACULTY_ID) + "/heartbeat";
  String ipStr = WiFi.localIP().toString();
  int rssi = WiFi.RSSI();
  String payload = "{\"rssi\":" + String(rssi) + ",\"ip\":\"" + ipStr + "\"}";

  HTTPClient http;
  http.setTimeout(4000);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-KEY", API_KEY);

  Serial.printf("[HEARTBEAT] POST %s | Payload: %s\n", url.c_str(), payload.c_str());
  int httpCode = http.POST(payload);
  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("[HEARTBEAT] Response code: %d | Body: %s\n", httpCode, response.c_str());
  } else {
    Serial.printf("[HEARTBEAT] Failed, error: %s\n", http.errorToString(httpCode).c_str());
  }
  http.end();
}

void waitForButtonRelease(int pin) {
  while (digitalRead(pin) == LOW) {
    delay(10);
  }
  delay(DEBOUNCE_MS);
}

void pollButton(const PushButton& btn) {
  if (digitalRead(btn.pin) == LOW) {
    delay(DEBOUNCE_MS);
    if (digitalRead(btn.pin) == LOW) {
      Serial.printf("[BTN] %s button pressed (GPIO %d)\n", btn.label, btn.pin);
      waitForButtonRelease(btn.pin);
      sendAvailabilityStatus(btn.targetAvailability);
      lastHeartbeatMs = millis();
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);

  pinMode(BTN_AVAILABLE_PIN, INPUT_PULLUP);
  pinMode(BTN_UNAVAILABLE_PIN, INPUT_PULLUP);

  Serial.println("\n=== VVCE CSE (AI & ML) Faculty Cabin Availability ESP32 ===");
  Serial.printf("Configured Faculty ID: %d | Server: %s\n", FACULTY_ID, SERVER);

  connectWiFi();
  if (WiFi.status() == WL_CONNECTED) {
    sendHeartbeat();
    lastHeartbeatMs = millis();
  }
}

void loop() {
  ensureWiFiConnected();

  for (const PushButton& btn : buttons) {
    pollButton(btn);
  }

  unsigned long now = millis();
  if (WiFi.status() == WL_CONNECTED && (lastHeartbeatMs == 0 || now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS)) {
    lastHeartbeatMs = now;
    sendHeartbeat();
  }

  delay(10);
}
