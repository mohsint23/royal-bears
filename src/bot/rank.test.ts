import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rankScore } from './rank.js'

const at = (tier: string, division: string | null, lp: number) => rankScore({ tier, division, lp })

test('a higher tier always wins', () => {
  assert.ok(at('DIAMOND', 'IV', 0) > at('EMERALD', 'I', 99))
  assert.ok(at('GRANDMASTER', 'I', 0) > at('MASTER', 'I', 1500))
  assert.ok(at('CHALLENGER', 'I', 0) > at('GRANDMASTER', 'I', 900))
})

test('divisions run IV up to I', () => {
  assert.ok(at('GOLD', 'I', 0) > at('GOLD', 'II', 99))
  assert.ok(at('GOLD', 'II', 0) > at('GOLD', 'III', 99))
  assert.ok(at('GOLD', 'III', 0) > at('GOLD', 'IV', 99))
})

test('LP separates two players in the same division', () => {
  assert.ok(at('EMERALD', 'II', 74) > at('EMERALD', 'II', 12))
})

// The bug this file exists for: capping LP at 99 made every Master from 99 LP
// upwards score identically, so the ladder ordered them by whatever broke the
// tie rather than by rank.
test('LP is not capped, so apex ranks order properly', () => {
  assert.ok(at('MASTER', 'I', 400) > at('MASTER', 'I', 133))
  assert.ok(at('MASTER', 'I', 133) > at('MASTER', 'I', 99))
  assert.ok(at('CHALLENGER', 'I', 1200) > at('CHALLENGER', 'I', 800))
})

test('unranked sorts below everything', () => {
  assert.equal(rankScore(undefined), -1)
  assert.equal(at(null as unknown as string, null, 0), -1)
  assert.ok(at('IRON', 'IV', 0) > rankScore(undefined))
})

test('a missing division is treated as the lowest one', () => {
  assert.equal(at('MASTER', null, 133), at('MASTER', 'IV', 133))
})
