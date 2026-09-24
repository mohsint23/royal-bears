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
  attendanceChannel: process.env.ATTENDANCE_CHANNEL || 'attendance',
  playerDbChannel: process.env.PLAYER_DB_CHANNEL || 'player-database',
  databasePath: process.env.DATABASE_PATH || './data/royal-bears.db',
  /** Where the tiny web server listens. Railway sets PORT; locally it stays off unless set. */
  port: process.env.PORT ? Number(process.env.PORT) : undefined,
  /** Public base URL of that server, for tier-list images in the Google Sheet. Railway fills RAILWAY_PUBLIC_DOMAIN once a domain exists. */
  publicUrl:
    process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined),
  /** Google Sheets mirror: the Apps Script web-app URL, its shared secret, and the sheet's share link. */
  sheetWebhook: process.env.GOOGLE_SHEET_WEBHOOK,
  sheetSecret: process.env.GOOGLE_SHEET_SECRET,
  sheetUrl: process.env.GOOGLE_SHEET_URL,
}

export const ROLE_NAMES = {
  staff: 'Staff',
  officer: 'LoL Officer',
  captainA: 'Team A Captain',
  captainB: 'Team B Captain',
  coach: 'Coach',
  aTeam: 'A Team',
  bTeam: 'B Team',
  member: 'Member',
  visitor: 'Visitor',
  bots: 'Bots',
} as const

/**
 * The three people who run the tracker: captains plus the officer. Narrower
 * than STAFF_ROLES, which lets the coach in.
 */
export const TRACKER_ROLES: string[] = [
  ROLE_NAMES.staff,
  ROLE_NAMES.officer,
  ROLE_NAMES.captainA,
  ROLE_NAMES.captainB,
]

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

/** How many ranked games a player is expected to get through in a week. */
export const WEEKLY_GAME_TARGET = 10

/** Only these count toward that target — ARAM and Arena are not practice. */
export const RANKED_QUEUE_IDS = [420, 440]

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
