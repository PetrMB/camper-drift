#include "protocol.h"

#include <ArduinoJson.h>

#include "board.h"

namespace {

uint16_t accentColor(const char* name) {
  if (!name) return COLOR_ELECTRIC;
  if (strcmp(name, "teal") == 0) return COLOR_TEAL;
  if (strcmp(name, "yellow") == 0) return COLOR_YELLOW;
  if (strcmp(name, "orange") == 0) return COLOR_ORANGE;
  if (strcmp(name, "blue") == 0) return COLOR_BLUE;
  return COLOR_ELECTRIC;
}

void copyText(char* dst, size_t size, const char* src) {
  if (!src) {
    dst[0] = '\0';
    return;
  }
  strncpy(dst, src, size - 1);
  dst[size - 1] = '\0';
}

/**
 * Z absolutního času resetu (epoch ms podle počítače) udělá termín v místní
 * millis() ose. Počítá se z rozdílu proti "now", které přišlo ve stejné zprávě,
 * takže na hodinách ESP nezáleží.
 */
void applyWindow(UsageWindow& out, JsonVariantConst src, int64_t nowEpochMs, uint32_t nowMillis) {
  out = UsageWindow{};
  if (src.isNull()) return;
  out.present = true;

  JsonVariantConst utilization = src["utilization"];
  if (!utilization.isNull() && utilization.is<float>()) {
    out.hasUtilization = true;
    int value = (int)lroundf(utilization.as<float>());
    out.utilization = constrain(value, 0, 100);
  }

  JsonVariantConst resetsAt = src["resetsAt"];
  if (!resetsAt.isNull() && resetsAt.is<int64_t>()) {
    int64_t delta = resetsAt.as<int64_t>() - nowEpochMs;
    if (delta < 0) delta = 0;
    // Nad 30 dnů by přetekl uint32 v milisekundách — takový reset stejně neexistuje.
    if (delta > 30LL * 24 * 3600 * 1000) delta = 30LL * 24 * 3600 * 1000;
    out.hasDeadline = true;
    out.deadlineMillis = nowMillis + (uint32_t)delta;
  }

  const char* source = src["source"];
  out.source = (source && strcmp(source, "estimate") == 0) ? WindowSource::Estimate : WindowSource::Api;
}

}  // namespace

bool parseMessage(const char* line, size_t length, AppState& state, uint32_t nowMillis) {
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, line, length);
  if (error) return false;

  JsonVariantConst now = doc["now"];
  if (now.isNull() || !now.is<int64_t>()) return false;
  const int64_t nowEpochMs = now.as<int64_t>();

  JsonArrayConst accounts = doc["accounts"];
  if (accounts.isNull()) return false;

  size_t index = 0;
  for (JsonObjectConst account : accounts) {
    if (index >= MAX_ACCOUNTS) break;
    AccountState& target = state.accounts[index];

    copyText(target.label, sizeof(target.label), account["label"] | "");
    copyText(target.status, sizeof(target.status), account["status"] | "ok");
    copyText(target.detail, sizeof(target.detail), account["detail"] | "");
    target.accent = accentColor(account["accent"] | "electric");
    target.estimated = account["estimated"] | false;

    applyWindow(target.fiveHour, account["fiveHour"], nowEpochMs, nowMillis);
    applyWindow(target.sevenDay, account["sevenDay"], nowEpochMs, nowMillis);

    index++;
  }

  state.accountCount = index;
  state.lastMessageMillis = nowMillis;
  state.everReceived = true;
  return true;
}

size_t formatCountdown(char* out, size_t size, uint32_t remainingMs) {
  if (remainingMs == 0) return snprintf(out, size, "teď");

  const uint32_t totalMinutes = remainingMs / 60000UL;
  const uint32_t days = totalMinutes / 1440UL;
  const uint32_t hours = (totalMinutes % 1440UL) / 60UL;
  const uint32_t minutes = totalMinutes % 60UL;

  if (days > 0) {
    // Skloňování drží stejná pravidla jako widget na počítači.
    const char* unit = days == 1 ? "den" : (days <= 4 ? "dny" : "dni");
    if (hours > 0) return snprintf(out, size, "%lud %luh", (unsigned long)days, (unsigned long)hours);
    return snprintf(out, size, "%lu %s", (unsigned long)days, unit);
  }
  if (hours > 0) return snprintf(out, size, "%lu:%02lu", (unsigned long)hours, (unsigned long)minutes);
  if (minutes > 0) return snprintf(out, size, "%lu min", (unsigned long)minutes);
  return snprintf(out, size, "%lu s", (unsigned long)(remainingMs / 1000UL));
}

uint32_t remainingMs(const UsageWindow& window, uint32_t nowMillis) {
  if (!window.hasDeadline) return 0;
  const int32_t delta = (int32_t)(window.deadlineMillis - nowMillis);
  return delta > 0 ? (uint32_t)delta : 0;
}
