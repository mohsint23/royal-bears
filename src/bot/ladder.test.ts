import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MIN_WINRATE_GAMES, placeEntries, type Entry } from './ladder.js'

/** Only the fields the ordering looks at need to be real. */
function entry(name: string, score: number, played: number, wins: number): Entry {
  return {
    name,
    score,
    wins,
    rank: undefined,
    account: {
      puuid: name, discord_id: name, game_name: name, tag_line: 'EUW',
      is_main: 1, registered_at: 0,
    },
    games: Array.from({ length: played }, () => ({}) as Entry['games'][number]),
  }
}

const names = (entries: Entry[]) => entries.map((e) => e.name)

test('rank order puts the highest score first', () => {
  const { placed, unplaced } = placeEntries(
    [entry('silver', 2300, 0, 0), entry('emerald', 5100, 0, 0), entry('unranked', -1, 0, 0)],
    'rank',
  )
  assert.deepEqual(names(placed), ['emerald', 'silver', 'unranked'])
  assert.deepEqual(unplaced, [])
})

test('games this week break a tie on rank', () => {
  const { placed } = placeEntries([entry('dormant', 5100, 1, 1), entry('active', 5100, 9, 4)], 'rank')
  assert.deepEqual(names(placed), ['active', 'dormant'])
})

test('games order counts every account, not rank', () => {
  const { placed } = placeEntries([entry('low', 1200, 14, 7), entry('high', 7000, 3, 3)], 'games')
  assert.deepEqual(names(placed), ['low', 'high'])
})

test('win rate places only players with enough games', () => {
  const { placed, unplaced } = placeEntries(
    [
      entry('grinder', 1000, 20, 13),
      entry('perfect', 1000, MIN_WINRATE_GAMES - 1, MIN_WINRATE_GAMES - 1),
      entry('steady', 1000, 10, 7),
    ],
    'winrate',
  )
  // 70% beats 65%, and a 100% week off four games is not placed at all.
  assert.deepEqual(names(placed), ['steady', 'grinder'])
  assert.deepEqual(names(unplaced), ['perfect'])
})

test('ordering never reorders the caller’s array', () => {
  const entries = [entry('a', 1000, 1, 0), entry('b', 9000, 30, 20)]
  placeEntries(entries, 'rank')
  placeEntries(entries, 'games')
  placeEntries(entries, 'winrate')
  assert.deepEqual(names(entries), ['a', 'b'])
})
