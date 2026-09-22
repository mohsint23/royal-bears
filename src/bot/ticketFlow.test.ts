import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QUESTIONS, nextQuestion, isComplete, channelName, nudgeDue } from './ticketFlow.js'

test('six questions in the agreed order', () => {
  assert.deepEqual(
    QUESTIONS.map((q) => q.key),
    ['peak_rank', 'current_rank', 'main_role', 'main_champs', 'secondary_roles', 'secondary_champs'],
  )
})

test('nextQuestion walks the list and stops at the end', () => {
  assert.equal(nextQuestion({})?.key, 'peak_rank')
  assert.equal(nextQuestion({ peak_rank: 'Gold' })?.key, 'current_rank')
  const all = Object.fromEntries(QUESTIONS.map((q) => [q.key, 'x']))
  assert.equal(nextQuestion(all), undefined)
  assert.equal(isComplete(all), true)
  assert.equal(isComplete({ peak_rank: 'Gold' }), false)
})

test('channelName is discord-safe and status-prefixed', () => {
  assert.equal(channelName('open', 'Mo Thabit'), 'tryout-mo-thabit')
  assert.equal(channelName('trialling', 'draatini'), 'trialling-draatini')
  assert.equal(channelName('accepted', '✨Star✨'), 'accepted-star')
  assert.equal(channelName('declined', ''), 'declined-applicant')
  assert.ok(channelName('open', 'a'.repeat(200)).length <= 100)
})

test('nudgeDue fires once after 24h of silence on an unfinished ticket', () => {
  const day = 24 * 60 * 60 * 1000
  const base = { answers: {}, last_activity: 0, nudged_at: null as number | null }
  assert.equal(nudgeDue(base, day - 1), false)
  assert.equal(nudgeDue(base, day + 1), true)
  assert.equal(nudgeDue({ ...base, nudged_at: day }, 2 * day), false)
  const all = Object.fromEntries(QUESTIONS.map((q) => [q.key, 'x']))
  assert.equal(nudgeDue({ ...base, answers: all }, 2 * day), false)
})
