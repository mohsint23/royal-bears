import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DAY, DECAY_RULES, decayState } from './decay.js'

const now = Date.UTC(2026, 9, 22, 10)
const ago = (days: number) => now - days * DAY
const diamond = DECAY_RULES.DIAMOND!
const master = DECAY_RULES.MASTER!

test('no solo games in the window means decaying now', () => {
  const s = decayState(diamond, [], now)
  assert.equal(s.days, 0)
  assert.equal(s.toFill, 4)
  assert.equal(s.toSafe, 1)
})

test('one Diamond game banks a week, minus the time since', () => {
  assert.equal(decayState(diamond, [ago(2)], now).days, 5)
})

test('the Diamond bank stops at 28 days', () => {
  const s = decayState(diamond, [ago(1), ago(1), ago(1), ago(1), ago(1), ago(1)], now)
  assert.equal(s.days, 27)
  assert.equal(s.toFill, 1)
})

test('the bank empties between games and does not go negative', () => {
  // Day 20: +7, drained by day 13. Day 3: +7 from empty, 4 left.
  assert.equal(decayState(diamond, [ago(20), ago(3)], now).days, 4)
})

test('Master banks a day per game, capped at 14', () => {
  const twenty = Array.from({ length: 20 }, () => ago(0.5))
  assert.equal(decayState(master, twenty, now).days, 13)
  assert.equal(decayState(master, [ago(0.5), ago(0.5), ago(0.5)], now).days, 2)
  assert.equal(decayState(master, [], now).toFill, 14)
  assert.equal(decayState(master, [ago(0.5), ago(0.5), ago(0.5)], now).toSafe, 2)
})

test('games older than the cap cannot leave anything in the bank', () => {
  assert.equal(decayState(diamond, [ago(40), ago(35)], now).days, 0)
})
