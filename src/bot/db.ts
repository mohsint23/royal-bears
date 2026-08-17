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
  CREATE TABLE IF NOT EXISTS players (
    discord_id    TEXT PRIMARY KEY,
    puuid         TEXT NOT NULL UNIQUE,
    game_name     TEXT NOT NULL,
    tag_line      TEXT NOT NULL,
    registered_at INTEGER NOT NULL
  );

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

  CREATE TABLE IF NOT EXISTS pools (
    discord_id TEXT NOT NULL,
    position   TEXT NOT NULL,
    champion   TEXT NOT NULL,
    PRIMARY KEY (discord_id, position, champion)
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

// Pools gained a confidence column after the first release. Existing rows keep
// their champions and default to the middle tier.
const poolColumns = db.prepare('PRAGMA table_info(pools)').all() as { name: string }[]
if (!poolColumns.some((c) => c.name === 'confidence')) {
  db.exec(`ALTER TABLE pools ADD COLUMN confidence TEXT NOT NULL DEFAULT 'B'`)
}

// The first version of tiers used words. Map them onto the letter grades.
// Harmless to re-run: nothing matches once it has been done.
db.exec(`
  UPDATE pools SET confidence = 'S' WHERE confidence = 'Comfort';
  UPDATE pools SET confidence = 'A' WHERE confidence = 'Confident';
  UPDATE pools SET confidence = 'Willing to learn' WHERE confidence = 'Learning';
`)

export type Player = {
  discord_id: string
  puuid: string
  game_name: string
  tag_line: string
  registered_at: number
}

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

export const players = {
  all: () => db.prepare('SELECT * FROM players').all() as Player[],
  byDiscordId: (id: string) =>
    db.prepare('SELECT * FROM players WHERE discord_id = ?').get(id) as Player | undefined,
  byPuuid: (puuid: string) =>
    db.prepare('SELECT * FROM players WHERE puuid = ?').get(puuid) as Player | undefined,
  upsert(p: Omit<Player, 'registered_at'>) {
    db.prepare(`
      INSERT INTO players (discord_id, puuid, game_name, tag_line, registered_at)
      VALUES (@discord_id, @puuid, @game_name, @tag_line, @now)
      ON CONFLICT(discord_id) DO UPDATE SET
        puuid = excluded.puuid, game_name = excluded.game_name, tag_line = excluded.tag_line
    `).run({ ...p, now: Date.now() })
  },
  remove: (id: string) => db.prepare('DELETE FROM players WHERE discord_id = ?').run(id),
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

export type PoolRow = { position: string; champion: string; confidence: string }

export const pools = {
  forPlayer: (id: string) =>
    db.prepare('SELECT position, champion, confidence FROM pools WHERE discord_id = ? ORDER BY position, champion')
      .all(id) as PoolRow[],
  /**
   * Swaps a position's whole pool in one go, tiers included. Returns what
   * actually changed so the reply can say so rather than just "done".
   */
  replace(id: string, position: string, entries: { champion: string; confidence: string }[]) {
    const before = db
      .prepare('SELECT champion, confidence FROM pools WHERE discord_id = ? AND position = ?')
      .all(id, position) as { champion: string; confidence: string }[]

    const had = new Map(before.map((r) => [r.champion, r.confidence]))
    const want = new Map(entries.map((e) => [e.champion, e.confidence]))

    const added: string[] = []
    const moved: { champion: string; from: string; to: string }[] = []
    for (const [champion, confidence] of want) {
      const previous = had.get(champion)
      if (previous === undefined) added.push(champion)
      else if (previous !== confidence) moved.push({ champion, from: previous, to: confidence })
    }
    const removed = [...had.keys()].filter((c) => !want.has(c))

    db.transaction(() => {
      db.prepare('DELETE FROM pools WHERE discord_id = ? AND position = ?').run(id, position)
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO pools (discord_id, position, champion, confidence) VALUES (?, ?, ?, ?)',
      )
      for (const [champion, confidence] of want) stmt.run(id, position, champion, confidence)
    })()

    return { added, removed, moved }
  },
  forPlayers: (ids: string[]) => {
    if (!ids.length) return []
    const q = ids.map(() => '?').join(',')
    return db
      .prepare(`SELECT discord_id, position, champion, confidence FROM pools WHERE discord_id IN (${q})`)
      .all(...ids) as (PoolRow & { discord_id: string })[]
  },
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
