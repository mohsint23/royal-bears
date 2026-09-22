import { test } from 'node:test'
import assert from 'node:assert/strict'
import { QUESTIONS, nextQuestion, isComplete, channelName, nudgeDue, parseRiotId } from './ticketFlow.js'

test('eight questions in the agreed order, numbered', () => {
  assert.deepEqual(
    QUESTIONS.map((q) => q.key),
    ['riot_id', 'year', 'peak_rank', 'current_rank', 'main_role', 'main_champs', 'secondary_roles', 'secondary_champs'],
  )
  assert.ok(QUESTIONS[0]!.prompt.startsWith('**1/8**'))
  assert.ok(QUESTIONS[7]!.prompt.startsWith('**8/8**'))
})

test('parseRiotId accepts Name#TAG only', () => {
  assert.deepEqual(parseRiotId(' Faker #KR1 '), { gameName: 'Faker', tagLine: 'KR1' })
  assert.equal(parseRiotId('Faker'), undefined)
  assert.equal(parseRiotId('a#b#c'), undefined)
  assert.equal(parseRiotId('#EUW'), undefined)
})

test('nextQuestion walks the list and stops at the end', () => {
  assert.equal(nextQuestion({})?.key, 'riot_id')
  assert.equal(nextQuestion({ riot_id: 'a#b', year: '2nd' })?.key, 'peak_rank')
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
