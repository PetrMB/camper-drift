/** Endpoint, který pohání `/usage` v Claude Code. Nedokumentovaný — parsuj tolerantně. */
export const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage'

/** Jediný host, na který aplikace kdy volá. */
export const API_HOST = 'api.anthropic.com'

/** Beta hlavička vyžadovaná OAuth endpointem. */
export const ANTHROPIC_BETA = 'oauth-2025-04-20'

/**
 * Bez `User-Agent: claude-code/<verze>` spadneš do agresivně limitovaného bucketu
 * a dostaneš trvalé 429. Verze se detekuje z transcriptů, tohle je poslední záchrana.
 */
export const DEFAULT_CLAUDE_CODE_VERSION = '2.0.0'

/** Minimální interval pollingu na jeden token. Nižší hodnota = riziko 429. */
export const MIN_POLL_INTERVAL_MS = 180_000

/** Do jaké doby považujeme API data za čerstvá. */
export const FRESH_AFTER_MS = 10 * 60_000

/** Za jak dlouho data z API přestanou být použitelná a přepneme na lokální odhad. */
export const STALE_AFTER_MS = 60 * 60_000

/** Délka rolling okna Claude Code. */
export const BLOCK_HOURS = 5

/** Rezerva, se kterou považujeme token za expirovaný dřív, než skutečně vyprší. */
export const TOKEN_EXPIRY_MARGIN_MS = 60_000

/** Cooldown ručního refreshe (na účet). */
export const MANUAL_REFRESH_COOLDOWN_MS = 30_000

/** Strop pro backoff po 429. */
export const MAX_BACKOFF_MS = 30 * 60_000

/** Soubory transcriptů starší než tohle se při initial indexu vůbec nečtou. */
export const TRANSCRIPT_MAX_AGE_MS = 8 * 24 * 60 * 60_000

/** Prahové hodnoty pro barevnou severitu (a výchozí prahy notifikací). */
export const WARN_THRESHOLD = 80
export const CRITICAL_THRESHOLD = 95

export const APP_ID = 'com.petrmb.claudemonitor'
