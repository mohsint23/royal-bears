/**
 * How the ladder is ordered.
 *
 * Pure on purpose, and kept out of the command so the rules can be tested
 * without a database, a Discord guild or a Riot key — the same split as
 * ticketFlow.ts and tickets.ts. Nothing in here may import anything that reads
 * config at load time.
 */

import type { Account, MatchRow, RankRow } from './db.js'

export const SORTS = {
  rank: 'Rank',
  games: 'Games this week',
  winrate: 'Win rate this week',
} as const

export type SortKey = keyof typeof SORTS

/** Under this a win rate is noise, so the player is listed but not placed. */
export const MIN_WINRATE_GAMES = 5

/**
 * One player's row. `account` and `rank` are their best account, which is also
 * what their rank role comes from; `games` adds every account together, because
 * a week on a smurf is still a week of practice.
 */
export type Entry = {
  name: string
  account: Account
  rank: RankRow | undefined
  score: number
  games: MatchRow[]
  wins: number
}

/**
 * Orders the ladder and sets aside anyone the chosen measure cannot place.
 *
 * Sorting copies first: the caller's array is also what the summary figures are
 * counted from, and reordering it under them would be a trap.
 */
export function placeEntries(entries: Entry[], sort: SortKey): { placed: Entry[]; unplaced: Entry[] } {
  if (sort === 'games') {
    return {
      placed: [...entries].sort((a, b) => b.games.length - a.games.length || b.score - a.score),
      unplaced: [],
    }
  }

  if (sort === 'winrate') {
    // Four wins from four games is not a better week than 13 from 20, so a
    // minimum number of games has to be met before a rate means anything.
    const placed = entries
      .filter((e) => e.games.length >= MIN_WINRATE_GAMES)
      .sort((a, b) => b.wins / b.games.length - a.wins / a.games.length || b.games.length - a.games.length)
    const unplaced = entries
      .filter((e) => e.games.length < MIN_WINRATE_GAMES)
      .sort((a, b) => b.games.length - a.games.length || b.score - a.score)
    return { placed, unplaced }
  }

  // Rank, with games this week breaking ties so an active player edges out
  // somebody sitting on the same LP who has not logged in.
  return {
    placed: [...entries].sort((a, b) => b.score - a.score || b.games.length - a.games.length),
    unplaced: [],
  }
}
