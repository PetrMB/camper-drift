#pragma once

/*
 * LilyGO T-Display-S3 — pinout a konfigurace panelu.
 *
 * Displej NENÍ na SPI: ST7789 tu visí na 8bitové paralelní sběrnici (i80),
 * kterou ESP32-S3 obsluhuje periferií LCD_CAM. Proto Bus_Parallel8.
 *
 * Dvě pasti, na kterých se tahle deska běžně zasekne:
 *  1) GPIO15 musí jít do HIGH, jinak zůstane displej bez napájení a obrazovka
 *     černá, i když kód normálně běží.
 *  2) Panel je 170 px široký, ale řadič 240 — bez offset_x = 35 je obraz
 *     posunutý a vpravo zůstane pruh.
 */

#include <LovyanGFX.hpp>

// --- piny -------------------------------------------------------------------

static constexpr int PIN_POWER_ON = 15;  // napájení LCD, musí být HIGH
static constexpr int PIN_BUTTON_BOOT = 0;
static constexpr int PIN_BUTTON_KEY = 14;

// --- barvy ŠKODA CI v RGB565 ------------------------------------------------

static constexpr uint16_t COLOR_EMERALD = 0x09C5;   // #0E3A2F
static constexpr uint16_t COLOR_ELECTRIC = 0x7FD5;  // #78FAAE
static constexpr uint16_t COLOR_WHITE = 0xFFFF;
static constexpr uint16_t COLOR_STEEL = 0xA535;     // #A0A7A8
static constexpr uint16_t COLOR_ORANGE = 0xFD88;    // #F7B046
static constexpr uint16_t COLOR_RED = 0xF28A;       // #F15252
static constexpr uint16_t COLOR_TEAL = 0x16BB;      // #1ED4DF
static constexpr uint16_t COLOR_YELLOW = 0xFF4C;    // #FAEB67
static constexpr uint16_t COLOR_BLUE = 0x0B14;      // #0961A1
static constexpr uint16_t COLOR_TRACK = 0x2AC8;     // Emerald zesvětlený na dráhu barů

class LGFX : public lgfx::LGFX_Device {
  lgfx::Panel_ST7789 _panel;
  lgfx::Bus_Parallel8 _bus;
  lgfx::Light_PWM _light;

 public:
  LGFX() {
    {
      auto cfg = _bus.config();
      cfg.freq_write = 20000000;
      cfg.pin_wr = 8;
      cfg.pin_rd = 9;
      cfg.pin_rs = 7;  // DC
      cfg.pin_d0 = 39;
      cfg.pin_d1 = 40;
      cfg.pin_d2 = 41;
      cfg.pin_d3 = 42;
      cfg.pin_d4 = 45;
      cfg.pin_d5 = 46;
      cfg.pin_d6 = 47;
      cfg.pin_d7 = 48;
      _bus.config(cfg);
      _panel.setBus(&_bus);
    }
    {
      auto cfg = _panel.config();
      cfg.pin_cs = 6;
      cfg.pin_rst = 5;
      cfg.pin_busy = -1;
      cfg.panel_width = 170;
      cfg.panel_height = 320;
      cfg.offset_x = 35;  // viz poznámka výše
      cfg.offset_y = 0;
      cfg.offset_rotation = 0;
      cfg.readable = false;
      cfg.invert = true;
      cfg.rgb_order = false;
      cfg.dlen_16bit = false;
      cfg.bus_shared = false;
      _panel.config(cfg);
    }
    {
      auto cfg = _light.config();
      cfg.pin_bl = 38;
      cfg.invert = false;
      cfg.freq = 12000;
      cfg.pwm_channel = 7;
      _light.config(cfg);
      _panel.setLight(&_light);
    }
    setPanel(&_panel);
  }
};
