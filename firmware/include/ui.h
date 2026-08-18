#pragma once

#include "board.h"
#include "state.h"

/**
 * Vykreslení do off-screen sprite a jeden push na displej — bez blikání.
 * Sprite 320×170 při 16 bitech zabere ~109 kB, proto jde do PSRAM.
 */
class Ui {
 public:
  void begin(LGFX& display);
  void render(const AppState& state, size_t activeIndex, uint32_t nowMillis);

 private:
  static void formatCountdownAscii(char* out, size_t size, uint32_t remaining, bool hasDeadline);

  LGFX* _display = nullptr;
  LGFX_Sprite _canvas;
};
