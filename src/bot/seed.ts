/**
 * One-time import of account links into an empty database.
 *
 * Matches, ranks and rank roles all rebuild themselves from Riot within a poll
 * or two, but the Discord-to-Riot links cannot: only the player can create one
 * with /register. Moving host would otherwise mean chasing everybody to
 * re-register, so those rows travel in an environment variable instead.
 *
 * Set SEED_DATA to base64-encoded JSON of { accounts, champTargets }. Every
 * insert ignores conflicts, so leaving it set forever is harmless.
 */

import { db, type Account, type ChampTarget } from './db.js'

type Seed = { accounts?: Account[]; champTargets?: ChampTarget[] }

export function applySeed(encoded = process.env.SEED_DATA): void {
  if (!encoded) return

  let seed: Seed
  try {
    seed = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as Seed
  } catch {
    console.error('[seed] SEED_DATA is not valid base64 JSON — ignoring it.')
    return
  }

  const accounts = db.prepare(`
    INSERT OR IGNORE INTO accounts (puuid, discord_id, game_name, tag_line, is_main, registered_at)
    VALUES (@puuid, @discord_id, @game_name, @tag_line, @is_main, @registered_at)
  `)
  const targets = db.prepare(`
    INSERT OR IGNORE INTO champ_targets (discord_id, champion, assigned_by, assigned_at, note)
    VALUES (@discord_id, @champion, @assigned_by, @assigned_at, @note)
  `)

  const added = db.transaction((s: Seed) => {
    let n = 0
    for (const a of s.accounts ?? []) n += accounts.run(a).changes
    for (const t of s.champTargets ?? []) targets.run({ ...t, note: t.note ?? null })
    return n
  })(seed)

  if (added) console.log(`[seed] imported ${added} account link${added === 1 ? '' : 's'}.`)
}
