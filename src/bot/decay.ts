/**
 * Ranked decay, worked out from match history.
 *
 * Riot does not expose the decay bank through the API, so this replays it from
 * solo queue games. Diamond banks 7 days per game up to 28; Master and above
 * bank 1 day per game up to 14. The bank drains a day at a time and decay
 * starts once it is empty. Flex games do not count.
 *
 * The replay starts from an empty bank one full cap before now. Anything banked
 * before that would have drained by today anyway, so the answer can only ever
 * be a little low, never high: a warning comes early rather than late.
 */

export const DAY = 24 * 60 * 60 * 1000

/** Solo/duo is the only queue that decays, and the only one that feeds the bank. */
export const SOLO_QUEUE_ID = 420

export type DecayRule = { perGame: number; cap: number }

export const DECAY_RULES: Record<string, DecayRule> = {
  DIAMOND: { perGame: 7, cap: 28 },
  MASTER: { perGame: 1, cap: 14 },
  GRANDMASTER: { perGame: 1, cap: 14 },
  CHALLENGER: { perGame: 1, cap: 14 },
}

/** Ping a player once their bank is down to this many days. */
export const DECAY_WARN_DAYS = 3

export function decayRule(tier: string | null | undefined): DecayRule | undefined {
  return tier ? DECAY_RULES[tier] : undefined
}

/** How far back the replay has to look for a tier. */
export function decayWindow(rule: DecayRule): number {
  return rule.cap * DAY
}

export type DecayState = {
  /** Whole days left in the bank. 0 means decaying now. */
  days: number
  /** When the bank runs dry, as a timestamp. */
  emptyAt: number
  /** Solo games needed to get back above the warning line. */
  toSafe: number
  /** Solo games needed to top the bank back up to full. */
  toFill: number
}

export function decayState(rule: DecayRule, soloGamesAt: number[], now = Date.now()): DecayState {
  const start = now - decayWindow(rule)
  const games = soloGamesAt.filter((t) => t >= start && t <= now).sort((a, b) => a - b)

  let bank = 0
  let last = start
  for (const at of games) {
    bank = Math.max(0, bank - (at - last))
    bank = Math.min(rule.cap * DAY, bank + rule.perGame * DAY)
    last = at
  }
  bank = Math.max(0, bank - (now - last))

  const days = Math.floor(bank / DAY)
  return {
    days,
    emptyAt: now + bank,
    toSafe: Math.max(0, Math.ceil((DECAY_WARN_DAYS + 1 - days) / rule.perGame)),
    toFill: Math.ceil((rule.cap - days) / rule.perGame),
  }
}
