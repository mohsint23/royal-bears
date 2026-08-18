/**
 * Progress against the champions a captain has asked someone to play.
 *
 * Counted from the start of the week, not from when the target was set: a
 * captain asking on Tuesday for a champion someone already played on Monday
 * wants to see those games, not a zero.
 */

import { RANKED_QUEUE_IDS } from './config.js'
import { accounts, champTargets, matches, type ChampTarget } from './db.js'
import { championDisplay, resolveChampion } from './ddragon.js'
import { winratePct } from './format.js'

export type Tally = { games: number; wins: number }

export type ChampProgress = {
  target: ChampTarget
  name: string
  week: Tally
  /** Everything the tracker holds for that champion, however far back it goes. */
  tracked: Tally
}

const tally = (rows: { win: number }[]): Tally => ({
  games: rows.length,
  wins: rows.filter((r) => r.win).length,
})

export function champProgress(discordId: string, weekStart: number): ChampProgress[] {
  const history = accounts
    .forUser(discordId)
    .flatMap((a) => matches.recent(a.puuid, 200))
    .filter((m) => RANKED_QUEUE_IDS.includes(m.queue_id))

  return champTargets.forUser(discordId).map((target) => {
    const on = history.filter((m) => resolveChampion(m.champion)?.id === target.champion)
    return {
      target,
      name: championDisplay(target.champion),
      week: tally(on.filter((m) => m.played_at >= weekStart)),
      tracked: tally(on),
    }
  })
}

/** One line per target, shared by the daily post and /champ list. */
export function champLine(p: ChampProgress): string {
  const { games, wins } = p.week
  const head = games
    ? `**${games}** this week · ${winratePct(wins, games - wins)} (${wins}W ${games - wins}L)`
    : 'none this week'
  const overall = p.tracked.games
    ? ` · ${p.tracked.games} on record, ${winratePct(p.tracked.wins, p.tracked.games - p.tracked.wins)}`
    : ''
  return `**${p.name}** — ${head}${overall}`
}
