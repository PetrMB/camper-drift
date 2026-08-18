#pragma once

#include <Arduino.h>

static constexpr size_t MAX_ACCOUNTS = 4;

/** Kolik chybějících zpráv snese, než se přepne do stavu "bez spojení". */
static constexpr uint32_t LINK_TIMEOUT_MS = 15UL * 60UL * 1000UL;

enum class WindowSource : uint8_t { Api, Estimate };

struct UsageWindow {
  bool present = false;
  bool hasUtilization = false;
  int utilization = 0;
  bool hasDeadline = false;
  /**
   * Okamžik resetu přepočítaný na lokální millis().
   * ESP nemá hodiny, ale počítač posílá i svoje "teď", takže se z rozdílu
   * dá udělat termín v místní časové ose. Odpočet pak běží i bez spojení.
   */
  uint32_t deadlineMillis = 0;
  WindowSource source = WindowSource::Api;
};

struct AccountState {
  char label[24] = {0};
  uint16_t accent = 0;
  char status[20] = {0};
  char detail[80] = {0};
  bool estimated = false;
  UsageWindow fiveHour;
  UsageWindow sevenDay;
};

struct AppState {
  size_t accountCount = 0;
  AccountState accounts[MAX_ACCOUNTS];
  /** millis() poslední přijaté platné zprávy; 0 = ještě nic nedorazilo. */
  uint32_t lastMessageMillis = 0;
  bool everReceived = false;

  bool linkStale(uint32_t nowMillis) const {
    if (!everReceived) return true;
    return (uint32_t)(nowMillis - lastMessageMillis) > LINK_TIMEOUT_MS;
  }
};
