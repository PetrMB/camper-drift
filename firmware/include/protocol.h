#pragma once

#include <Arduino.h>

#include "state.h"

/**
 * Rozparsuje jednu řádku JSON z počítače a překlopí ji do stavu.
 * Vrací false, když je řádka poškozená — stav pak zůstane nedotčený,
 * takže displej dál ukazuje poslední platná data místo blikání.
 *
 * Očekávaný tvar:
 * {"now":1755424800000,
 *  "accounts":[{"label":"Osobni","accent":"electric","status":"ok",
 *               "estimated":false,"detail":"",
 *               "fiveHour":{"utilization":62,"resetsAt":1755428520000,"source":"api"},
 *               "sevenDay":{"utilization":41,"resetsAt":1755765600000,"source":"api"}}]}
 */
bool parseMessage(const char* line, size_t length, AppState& state, uint32_t nowMillis);

/** Zbývající čas okna v milisekundách; 0 když termín není znám nebo už uplynul. */
uint32_t remainingMs(const UsageWindow& window, uint32_t nowMillis);

/** Odpočet do textu ("1:12", "45 min", "2d 4h"). Vrací délku zápisu. */
size_t formatCountdown(char* out, size_t size, uint32_t remainingMs);
