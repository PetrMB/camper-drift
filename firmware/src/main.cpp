/*
 * ClaudeMonitor — firmware pro LilyGO T-Display-S3.
 *
 * Z počítače chodí po USB (sériová linka) jedna JSON řádka při každém pollu,
 * tedy zhruba jednou za tři minuty. Odpočet si deska tiká sama z millis(),
 * takže displej zůstane živý, i když počítač usne nebo se odpojí.
 */
#include <Arduino.h>

#include "board.h"
#include "protocol.h"
#include "state.h"
#include "ui.h"

namespace {

LGFX display;
Ui ui;
AppState state;

/** Který účet je právě zobrazený; přepíná se tlačítkem KEY. */
size_t activeAccount = 0;

constexpr size_t LINE_BUFFER_SIZE = 2048;
char lineBuffer[LINE_BUFFER_SIZE];
size_t lineLength = 0;

constexpr uint32_t RENDER_INTERVAL_MS = 250;
uint32_t lastRender = 0;

/** Úrovně podsvícení procházené tlačítkem BOOT. */
constexpr uint8_t BRIGHTNESS_LEVELS[] = {200, 120, 60, 20};
size_t brightnessIndex = 0;

struct Button {
  int pin;
  bool lastReading = true;  // tlačítka jsou na pull-up, klid = HIGH
  uint32_t changedAt = 0;

  explicit Button(int p) : pin(p) {}

  /** Vrací true jednou při stisku, s ošetřením zákmitů. */
  bool pressed(uint32_t nowMillis) {
    const bool reading = digitalRead(pin) == HIGH;
    if (reading == lastReading) return false;
    if (nowMillis - changedAt < 40) return false;
    changedAt = nowMillis;
    lastReading = reading;
    return reading == false;  // sepnutí = pád k zemi
  }
};

Button buttonKey(PIN_BUTTON_KEY);
Button buttonBoot(PIN_BUTTON_BOOT);

void readSerial(uint32_t nowMillis) {
  while (Serial.available() > 0) {
    const int c = Serial.read();
    if (c < 0) break;

    if (c == '\n') {
      if (lineLength > 0) {
        lineBuffer[lineLength] = '\0';
        if (!parseMessage(lineBuffer, lineLength, state, nowMillis)) {
          // Poškozená řádka se zahodí a poslední platný stav zůstane na displeji.
          Serial.println("{\"ack\":false}");
        } else {
          if (activeAccount >= state.accountCount) activeAccount = 0;
          Serial.println("{\"ack\":true}");
        }
      }
      lineLength = 0;
      continue;
    }

    if (c == '\r') continue;

    if (lineLength + 1 >= LINE_BUFFER_SIZE) {
      // Přetečení: zahoď zbytek řádky, ať se nerozsype parsování těch dalších.
      lineLength = 0;
      continue;
    }
    lineBuffer[lineLength++] = (char)c;
  }
}

}  // namespace

void setup() {
  // Bez tohohle zůstane displej bez napájení a obrazovka černá.
  pinMode(PIN_POWER_ON, OUTPUT);
  digitalWrite(PIN_POWER_ON, HIGH);

  pinMode(PIN_BUTTON_BOOT, INPUT_PULLUP);
  pinMode(PIN_BUTTON_KEY, INPUT_PULLUP);

  Serial.begin(115200);

  display.init();
  display.setRotation(1);  // na šířku, 320×170
  display.setBrightness(BRIGHTNESS_LEVELS[brightnessIndex]);
  display.fillScreen(COLOR_EMERALD);

  ui.begin(display);
  ui.render(state, activeAccount, millis());
}

void loop() {
  const uint32_t nowMillis = millis();

  readSerial(nowMillis);

  if (buttonKey.pressed(nowMillis) && state.accountCount > 1) {
    activeAccount = (activeAccount + 1) % state.accountCount;
    lastRender = 0;  // překresli hned, ať přepnutí není líné
  }

  if (buttonBoot.pressed(nowMillis)) {
    brightnessIndex = (brightnessIndex + 1) % (sizeof(BRIGHTNESS_LEVELS) / sizeof(uint8_t));
    display.setBrightness(BRIGHTNESS_LEVELS[brightnessIndex]);
  }

  // Odpočet se mění po minutách, ale poslední minuta jede po sekundách —
  // čtvrtsekundový krok je kompromis mezi plynulostí a klidem panelu.
  if (nowMillis - lastRender >= RENDER_INTERVAL_MS) {
    lastRender = nowMillis;
    ui.render(state, activeAccount, nowMillis);
  }
}
