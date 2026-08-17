/**
 * All persistent state lives in one SQLite file.
 *
 * The schema is created on first run and migrated forward by simply adding
 * new CREATE TABLE statements below — every one is IF NOT EXISTS.
 */

import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { config } from './config.js'

mkdirSync(dirname(config.databasePath), { recursive: true })

export const db = new Database(config.databasePath)
db.pragma('journal_mode = WAL')

db.exec(`
  -- A player may link several Riot accounts. Exactly one is their main, which
  -- is what /team, /multi and the rank roles use.
  CREATE TABLE IF NOT EXISTS accounts (
    puuid         TEXT PRIMARY KEY,
    discord_id    TEXT NOT NULL,
    game_name     TEXT NOT NULL,
    tag_line      TEXT NOT NULL,
    is_main       INTEGER NOT NULL DEFAULT 0,
    registered_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS accounts_by_discord ON accounts (discord_id);

  -- One row per player per ranked queue: their standing as of the last poll.
  CREATE TABLE IF NOT EXISTS ranks (
    puuid      TEXT NOT NULL,
    queue      TEXT NOT NULL,
    tier       TEXT,
    division   TEXT,
    lp         INTEGER NOT NULL DEFAULT 0,
    wins       INTEGER NOT NULL DEFAULT 0,
    losses     INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (puuid, queue)
  );

  -- Every game we have already counted, so polls never double-count.
  CREATE TABLE IF NOT EXISTS matches (
    match_id  TEXT NOT NULL,
    puuid     TEXT NOT NULL,
    champion  TEXT NOT NULL,
    position  TEXT,
    win       INTEGER NOT NULL,
    kills     INTEGER NOT NULL,
    deaths    INTEGER NOT NULL,
    assists   INTEGER NOT NULL,
    queue_id  INTEGER NOT NULL,
    played_at INTEGER NOT NULL,
    PRIMARY KEY (match_id, puuid)
  );
  CREATE INDEX IF NOT EXISTS matches_by_player ON matches (puuid, played_at DESC);

  -- A tier-list screenshot standing in for, or alongside, the typed pool.
  -- The file itself lives on disk; this is just the bookkeeping.
  CREATE TABLE IF NOT EXISTS pool_images (
    discord_id  TEXT NOT NULL,
    position    TEXT NOT NULL,
    file        TEXT NOT NULL,
    uploaded_at INTEGER NOT NULL,
    PRIMARY KEY (discord_id, position)
  );

  CREATE TABLE IF NOT EXISTS scrims (
    message_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    team       TEXT NOT NULL,
    opponent   TEXT,
    when_text  TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scrim_rsvp (
    message_id TEXT NOT NULL,
    discord_id TEXT NOT NULL,
    answer     TEXT NOT NULL,
    PRIMARY KEY (message_id, discord_id)
  );

  -- Loose key/value store: the Riot key, the last weekly roundup date, etc.
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

// Accounts used to be one row per Discord user. Carry those across as mains.
const hasOldPlayers = db
  .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'players'`)
  .get()
if (hasOldPlayers) {
  db.exec(`
    INSERT OR IGNORE INTO accounts (puuid, discord_id, game_name, tag_line, is_main, registered_at)
      SELECT puuid, discord_id, game_name, tag_line, 1, registered_at FROM players;
    DROP TABLE players;
  `)
}

// Pools used to be typed in and graded by tier. They are uploaded images now,
// so the old table goes rather than sitting there confusing the next reader.
db.exec('DROP TABLE IF EXISTS pools')

export type Account = {
  puuid: string
  discord_id: string
  game_name: string
  tag_line: string
  is_main: number
  registered_at: number
}

/** How many Riot accounts one person may link. */
export const MAX_ACCOUNTS = 5

export const riotId = (a: Pick<Account, 'game_name' | 'tag_line'>) => `${a.game_name}#${a.tag_line}`

export type RankRow = {
  puuid: string
  queue: string
  tier: string | null
  division: string | null
  lp: number
  wins: number
  losses: number
  updated_at: number
}

export type MatchRow = {
  match_id: string
  puuid: string
  champion: string
  position: string | null
  win: number
  kills: number
  deaths: number
  assists: number
  queue_id: number
  played_at: number
}

export const settings = {
  get(key: string): string | undefined {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row?.value
  },
  set(key: string, value: string) {
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ).run(key, value)
  },
}

export const accounts = {
  all: () => db.prepare('SELECT * FROM accounts ORDER BY discord_id, is_main DESC').all() as Account[],

  /** Everything one person has linked, their main first. */
  forUser: (discordId: string) =>
    db
      .prepare('SELECT * FROM accounts WHERE discord_id = ? ORDER BY is_main DESC, registered_at ASC')
      .all(discordId) as Account[],

  mainFor: (discordId: string) =>
    db
      .prepare('SELECT * FROM accounts WHERE discord_id = ? ORDER BY is_main DESC, registered_at ASC LIMIT 1')
      .get(discordId) as Account | undefined,

  byPuuid: (puuid: string) =>
    db.prepare('SELECT * FROM accounts WHERE puuid = ?').get(puuid) as Account | undefined,

  countFor: (discordId: string) =>
    (db.prepare('SELECT COUNT(*) n FROM accounts WHERE discord_id = ?').get(discordId) as { n: number }).n,

  /** The first account someone links becomes their main automatically. */
  add(a: Omit<Account, 'is_main' | 'registered_at'>) {
    const first = accounts.countFor(a.discord_id) === 0
    db.prepare(`
      INSERT INTO accounts (puuid, discord_id, game_name, tag_line, is_main, registered_at)
      VALUES (@puuid, @discord_id, @game_name, @tag_line, @is_main, @now)
      ON CONFLICT(puuid) DO UPDATE SET
        discord_id = excluded.discord_id,
        game_name  = excluded.game_name,
        tag_line   = excluded.tag_line
    `).run({ ...a, is_main: first ? 1 : 0, now: Date.now() })
    return { becameMain: first }
  },

  setMain(discordId: string, puuid: string) {
    return db.transaction(() => {
      db.prepare('UPDATE accounts SET is_main = 0 WHERE discord_id = ?').run(discordId)
      return db.prepare('UPDATE accounts SET is_main = 1 WHERE puuid = ? AND discord_id = ?').run(puuid, discordId)
        .changes
    })()
  },

  /** Removing a main promotes the oldest remaining account so one always exists. */
  remove(puuid: string) {
    return db.transaction(() => {
      const account = accounts.byPuuid(puuid)
      if (!account) return false
      db.prepare('DELETE FROM accounts WHERE puuid = ?').run(puuid)
      if (account.is_main) {
        const next = accounts.forUser(account.discord_id)[0]
        if (next) db.prepare('UPDATE accounts SET is_main = 1 WHERE puuid = ?').run(next.puuid)
      }
      return true
    })()
  },

  /** Distinct Discord users with at least one account linked. */
  userIds: () =>
    (db.prepare('SELECT DISTINCT discord_id FROM accounts').all() as { discord_id: string }[]).map(
      (r) => r.discord_id,
    ),
}

export const ranks = {
  get: (puuid: string, queue: string) =>
    db.prepare('SELECT * FROM ranks WHERE puuid = ? AND queue = ?').get(puuid, queue) as RankRow | undefined,
  save(r: Omit<RankRow, 'updated_at'>) {
    db.prepare(`
      INSERT INTO ranks (puuid, queue, tier, division, lp, wins, losses, updated_at)
      VALUES (@puuid, @queue, @tier, @division, @lp, @wins, @losses, @now)
      ON CONFLICT(puuid, queue) DO UPDATE SET
        tier = excluded.tier, division = excluded.division, lp = excluded.lp,
        wins = excluded.wins, losses = excluded.losses, updated_at = excluded.updated_at
    `).run({ ...r, now: Date.now() })
  },
}

export const matches = {
  /** Ignores games we already have, so a poll can safely re-fetch. */
  insertMany(rows: MatchRow[]) {
    const stmt = db.prepare(`
      INSERT OR IGNORE INTO matches
        (match_id, puuid, champion, position, win, kills, deaths, assists, queue_id, played_at)
      VALUES (@match_id, @puuid, @champion, @position, @win, @kills, @deaths, @assists, @queue_id, @played_at)
    `)
    return db.transaction((all: MatchRow[]) => {
      let added = 0
      for (const row of all) added += stmt.run(row).changes
      return added
    })(rows)
  },
  known: (puuid: string, ids: string[]) => {
    if (!ids.length) return new Set<string>()
    const q = ids.map(() => '?').join(',')
    const rows = db
      .prepare(`SELECT match_id FROM matches WHERE puuid = ? AND match_id IN (${q})`)
      .all(puuid, ...ids) as { match_id: string }[]
    return new Set(rows.map((r) => r.match_id))
  },
  since: (puuid: string, since: number) =>
    db
      .prepare('SELECT * FROM matches WHERE puuid = ? AND played_at >= ? ORDER BY played_at DESC')
      .all(puuid, since) as MatchRow[],
  recent: (puuid: string, limit: number) =>
    db
      .prepare('SELECT * FROM matches WHERE puuid = ? ORDER BY played_at DESC LIMIT ?')
      .all(puuid, limit) as MatchRow[],
}

export type PoolImage = { discord_id: string; position: string; file: string; uploaded_at: number }

/** The key used for an image that covers the whole pool rather than one role. */
export const WHOLE_POOL = 'all'

export const poolImages = {
  forPlayer: (id: string) =>
    db.prepare('SELECT * FROM pool_images WHERE discord_id = ? ORDER BY position').all(id) as PoolImage[],
  get: (id: string, position: string) =>
    db.prepare('SELECT * FROM pool_images WHERE discord_id = ? AND position = ?').get(id, position) as
      | PoolImage
      | undefined,
  save: (id: string, position: string, file: string) =>
    db.prepare(`
      INSERT INTO pool_images (discord_id, position, file, uploaded_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(discord_id, position) DO UPDATE SET file = excluded.file, uploaded_at = excluded.uploaded_at
    `).run(id, position, file, Date.now()),
  remove: (id: string, position: string) =>
    db.prepare('DELETE FROM pool_images WHERE discord_id = ? AND position = ?').run(id, position),
}

export const scrims = {
  create: (row: { message_id: string; channel_id: string; team: string; opponent: string | null; when_text: string; created_by: string }) =>
    db.prepare(`
      INSERT INTO scrims (message_id, channel_id, team, opponent, when_text, created_by, created_at)
      VALUES (@message_id, @channel_id, @team, @opponent, @when_text, @created_by, @now)
    `).run({ ...row, now: Date.now() }),
  get: (messageId: string) =>
    db.prepare('SELECT * FROM scrims WHERE message_id = ?').get(messageId) as
      | { message_id: string; channel_id: string; team: string; opponent: string | null; when_text: string; created_by: string; created_at: number }
      | undefined,
  rsvp: (messageId: string, discordId: string, answer: string) =>
    db.prepare(`
      INSERT INTO scrim_rsvp (message_id, discord_id, answer) VALUES (?, ?, ?)
      ON CONFLICT(message_id, discord_id) DO UPDATE SET answer = excluded.answer
    `).run(messageId, discordId, answer),
  answers: (messageId: string) =>
    db.prepare('SELECT discord_id, answer FROM scrim_rsvp WHERE message_id = ?')
      .all(messageId) as { discord_id: string; answer: string }[],
}
