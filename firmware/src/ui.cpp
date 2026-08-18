#include "ui.h"

#include "protocol.h"

namespace {

constexpr int SCREEN_W = 320;
constexpr int SCREEN_H = 170;

constexpr int WARN_THRESHOLD = 80;
constexpr int CRITICAL_THRESHOLD = 95;

/**
 * ŠKODA CI: v jedné kompozici smí být maximálně JEDNA terciární barva.
 * Stejné pravidlo jako pickComposition() ve widgetu — když je někde kritická
 * červená, dostane ji i varovná hodnota, aby vedle sebe nesvítila červená
 * s oranžovou.
 */
uint16_t tertiaryFor(const AccountState& account) {
  const int five = account.fiveHour.hasUtilization ? account.fiveHour.utilization : 0;
  const int seven = account.sevenDay.hasUtilization ? account.sevenDay.utilization : 0;
  const int worst = max(five, seven);
  if (worst >= CRITICAL_THRESHOLD) return COLOR_RED;
  if (worst >= WARN_THRESHOLD) return COLOR_ORANGE;
  return 0;
}

uint16_t severityColor(const UsageWindow& window, uint16_t tertiary, uint16_t accent) {
  if (!window.hasUtilization) return COLOR_STEEL;
  if (window.utilization >= WARN_THRESHOLD && tertiary != 0) return tertiary;
  return accent;
}

void drawRing(LGFX_Sprite& canvas, int cx, int cy, int outer, int thickness, int percent,
              uint16_t color) {
  canvas.fillArc(cx, cy, outer - thickness, outer, 0, 360, COLOR_TRACK);
  if (percent <= 0) return;
  const float sweep = 360.0f * (float)constrain(percent, 0, 100) / 100.0f;
  // Začátek nahoře, po směru hodinových ručiček — stejně jako prstenec ve widgetu.
  canvas.fillArc(cx, cy, outer - thickness, outer, 270, 270 + sweep, color);
}

void drawBar(LGFX_Sprite& canvas, int x, int y, int w, int h, int percent, uint16_t color) {
  canvas.fillSmoothRoundRect(x, y, w, h, h / 2, COLOR_TRACK);
  const int filled = (int)((long)w * constrain(percent, 0, 100) / 100);
  if (filled >= h) canvas.fillSmoothRoundRect(x, y, filled, h, h / 2, color);
}

/**
 * ŠKODA facet: plochý klín v pravém dolním rohu, sklon ~22°.
 * Bez stínu a průhlednosti, nesmí zasahovat do textu.
 */
void drawFacet(LGFX_Sprite& canvas, uint16_t color) {
  const int w = 84;
  const int h = 34;
  canvas.fillTriangle(SCREEN_W, SCREEN_H - h, SCREEN_W, SCREEN_H, SCREEN_W - w, SCREEN_H, color);
}

}  // namespace

void Ui::begin(LGFX& display) {
  _display = &display;
  _canvas.setPsram(true);
  _canvas.setColorDepth(16);
  _canvas.createSprite(SCREEN_W, SCREEN_H);
}

void Ui::render(const AppState& state, size_t activeIndex, uint32_t nowMillis) {
  if (!_display) return;

  _canvas.fillSprite(COLOR_EMERALD);

  if (state.accountCount == 0) {
    _canvas.setTextColor(COLOR_STEEL);
    _canvas.setFont(&fonts::FreeSans9pt7b);
    _canvas.setTextDatum(middle_center);
    _canvas.drawString(state.everReceived ? "Zadny ucet" : "Cekam na pocitac", SCREEN_W / 2,
                       SCREEN_H / 2);
    drawFacet(_canvas, COLOR_ELECTRIC);
    _canvas.pushSprite(_display, 0, 0);
    return;
  }

  const size_t index = min(activeIndex, state.accountCount - 1);
  const AccountState& account = state.accounts[index];
  const uint16_t tertiary = tertiaryFor(account);
  const bool stale = state.linkStale(nowMillis);

  // --- hlavička ------------------------------------------------------------
  _canvas.fillSmoothCircle(16, 18, 5, stale ? COLOR_STEEL : account.accent);
  _canvas.setFont(&fonts::FreeSansBold9pt7b);
  _canvas.setTextColor(COLOR_WHITE);
  _canvas.setTextDatum(middle_left);
  _canvas.drawString(account.label, 30, 18);

  // Když je účtů víc, ukaž kolikátý je zobrazený.
  if (state.accountCount > 1) {
    char position[8];
    snprintf(position, sizeof(position), "%u/%u", (unsigned)(index + 1),
             (unsigned)state.accountCount);
    _canvas.setFont(&fonts::FreeSans9pt7b);
    _canvas.setTextColor(COLOR_STEEL);
    _canvas.setTextDatum(middle_right);
    _canvas.drawString(position, SCREEN_W - 12, 18);
  }

  // --- prstenec + odpočet --------------------------------------------------
  const UsageWindow& five = account.fiveHour;
  drawRing(_canvas, 52, 84, 34, 9, five.hasUtilization ? five.utilization : 0,
           severityColor(five, tertiary, account.accent));

  _canvas.setTextDatum(middle_center);
  _canvas.setFont(&fonts::FreeSansBold12pt7b);
  _canvas.setTextColor(COLOR_WHITE);
  if (five.hasUtilization) {
    char percent[8];
    snprintf(percent, sizeof(percent), "%d%%", five.utilization);
    _canvas.drawString(percent, 52, 84);
  } else {
    _canvas.drawString("-", 52, 84);
  }

  // Odpočet je největší prvek kompozice — kvůli němu celá věc existuje.
  char countdown[16];
  formatCountdownAscii(countdown, sizeof(countdown), remainingMs(five, nowMillis), five.hasDeadline);
  _canvas.setTextDatum(bottom_left);
  _canvas.setFont(&fonts::FreeSansBold24pt7b);
  _canvas.setTextColor(COLOR_WHITE);
  _canvas.drawString(countdown, 100, 92);

  _canvas.setFont(&fonts::FreeSans9pt7b);
  _canvas.setTextColor(COLOR_STEEL);
  _canvas.setTextDatum(top_left);
  _canvas.drawString(five.source == WindowSource::Estimate ? "5h - odhad" : "5h okno", 102, 98);

  // --- týdenní okno --------------------------------------------------------
  const UsageWindow& seven = account.sevenDay;
  if (seven.present) {
    _canvas.setFont(&fonts::FreeSans9pt7b);
    _canvas.setTextColor(COLOR_STEEL);
    _canvas.setTextDatum(middle_left);
    _canvas.drawString("7 dni", 14, 132);

    drawBar(_canvas, 62, 127, 140, 10, seven.hasUtilization ? seven.utilization : 0,
            severityColor(seven, tertiary, account.accent));

    char weekly[24];
    if (seven.hasUtilization) {
      snprintf(weekly, sizeof(weekly), "%d%%", seven.utilization);
    } else {
      snprintf(weekly, sizeof(weekly), "-");
    }
    _canvas.setTextDatum(middle_left);
    _canvas.drawString(weekly, 212, 132);
  }

  // --- stavový řádek -------------------------------------------------------
  _canvas.setFont(&fonts::FreeSans9pt7b);
  _canvas.setTextDatum(bottom_left);
  if (stale) {
    _canvas.setTextColor(COLOR_RED);
    _canvas.drawString("Bez spojeni s pocitacem", 14, SCREEN_H - 8);
  } else if (account.detail[0] != '\0') {
    _canvas.setTextColor(tertiary != 0 ? tertiary : COLOR_STEEL);
    _canvas.drawString(account.detail, 14, SCREEN_H - 8);
  }

  drawFacet(_canvas, COLOR_ELECTRIC);
  _canvas.pushSprite(_display, 0, 0);
}

void Ui::formatCountdownAscii(char* out, size_t size, uint32_t remaining, bool hasDeadline) {
  if (!hasDeadline) {
    snprintf(out, size, "--:--");
    return;
  }
  formatCountdown(out, size, remaining);
  // Font FreeSans neumí diakritiku, takže "teď" nahradíme ASCII variantou.
  if (strcmp(out, "teď") == 0) snprintf(out, size, "ted");
}
