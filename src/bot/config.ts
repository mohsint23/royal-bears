import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing ${name}. Copy .env.example to .env and fill it in.`)
    process.exit(1)
  }
  return value
}

export const config = {
  token: required('DISCORD_TOKEN'),
  guildId: required('GUILD_ID'),
  /** Riot splits its API in two: per-server for rank, per-continent for matches. */
  platform: process.env.RIOT_PLATFORM || 'euw1',
  region: process.env.RIOT_REGION || 'europe',
  opggRegion: process.env.OPGG_REGION || 'euw',
  statChannel: process.env.STAT_CHANNEL || 'stat-updates',
  databasePath: process.env.DATABASE_PATH || './data/royal-bears.db',
}

export const ROLE_NAMES = {
  staff: 'Staff',
  officer: 'LoL Officer',
  captainA: 'Team A Captain',
  captainB: 'Team B Captain',
  coach: 'Coach',
  aTeam: 'A Team',
  bTeam: 'B Team',
} as const

/** Anyone who may run staff-only commands. */
export const STAFF_ROLES: string[] = [
  ROLE_NAMES.staff,
  ROLE_NAMES.officer,
  ROLE_NAMES.captainA,
  ROLE_NAMES.captainB,
  ROLE_NAMES.coach,
]

export const POSITIONS = ['Top', 'Jungle', 'Mid', 'ADC', 'Support'] as const
export type Position = (typeof POSITIONS)[number]

/**
 * How sure a player is on a champion, best first.
 *
 * `id` is the modal input's customId, kept to plain letters because `key`
 * contains spaces and an apostrophe.
 */
export const CONFIDENCE = [
  { key: 'S', id: 's', mark: '🟡', hint: 'blind pick, can carry' },
  { key: 'A', id: 'a', mark: '🟣', hint: 'strong, happy any game' },
  { key: 'B', id: 'b', mark: '🔵', hint: 'playable' },
  { key: 'Willing to learn', id: 'learn', mark: '⚪', hint: 'will practise if needed' },
  { key: "Can't play", id: 'cant', mark: '⚫', hint: 'do not draft this' },
] as const
export type Confidence = (typeof CONFIDENCE)[number]['key']
export const CONFIDENCE_KEYS = CONFIDENCE.map((c) => c.key) as Confidence[]
export const DEFAULT_CONFIDENCE: Confidence = 'B'

/** Tiers a captain can actually draft from. */
export const DRAFTABLE: Confidence[] = ['S', 'A']

export const TIERS = [
  'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM',
  'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER',
] as const
export type Tier = (typeof TIERS)[number]

/** Discord role name for each Riot tier. Matches the roles setup.ts creates. */
export const TIER_ROLE: Record<Tier, string> = {
  IRON: 'Iron', BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold',
  PLATINUM: 'Platinum', EMERALD: 'Emerald', DIAMOND: 'Diamond',
  MASTER: 'Master', GRANDMASTER: 'Grandmaster', CHALLENGER: 'Challenger',
}

export const QUEUE = {
  solo: 'RANKED_SOLO_5x5',
  flex: 'RANKED_FLEX_SR',
} as const

/** Riot's numeric queue ids, used to label matches. */
export const QUEUE_ID: Record<number, string> = {
  400: 'Normal Draft',
  420: 'Ranked Solo',
  430: 'Normal Blind',
  440: 'Ranked Flex',
  450: 'ARAM',
  700: 'Clash',
  1700: 'Arena',
}
