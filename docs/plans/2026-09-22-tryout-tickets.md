# Tryout Tickets Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Every person who takes the Tryout role gets a private `#tryout-<name>` channel where the bot asks six questions one at a time, posts a summary card, and gives staff Trialling / Accept / Decline / Close buttons.

**Architecture:** Pure sequencing logic lives in `src/bot/ticketFlow.ts` (tested with `node:test`). Discord wiring lives in `src/bot/tickets.ts`, following the `isXButton` / `handleXButton` shape of `roles.ts` and `scrim.ts`. State is one `tryout_tickets` row per applicant in the existing SQLite database, written as each answer arrives so a restart resumes cleanly. The ticket opens from the existing tryout button and from a `GuildMemberUpdate` listener, de-duplicated by an in-flight map.

**Tech Stack:** TypeScript, discord.js 14.27, better-sqlite3, tsx, `node --test`.

Design: `docs/plans/2026-09-22-tryout-tickets-design.md`.

---

### Task 1: Test runner

**Files:**
- Modify: `package.json` (scripts)

**Step 1: Add the script**

```json
"test": "node --import tsx --test 'src/**/*.test.ts'",
```

**Step 2: Run it**

Run: `npm test`
Expected: exits 0 with "tests 0" (no test files yet). If it complains about the glob, change to `src/bot/*.test.ts`.

**Step 3: Commit**

```bash
git add package.json && git commit -m "Add a test script"
```

### Task 2: Pure ticket flow

**Files:**
- Create: `src/bot/ticketFlow.ts`
- Test: `src/bot/ticketFlow.test.ts`

**Step 1: Write the failing tests**

```ts
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
```

**Step 2: Run to verify failure**

Run: `npm test`
Expected: FAIL, cannot find module `./ticketFlow.js`.

**Step 3: Implement**

```ts
/**
 * The tryout questionnaire, minus Discord. Everything here is a pure function
 * so the ordering and naming rules can be tested without a bot token.
 */

export const QUESTIONS = [
  { key: 'peak_rank', label: 'Peak rank', prompt: "**1/6** What's your **peak rank**? (e.g. Emerald 2, season 13)" },
  { key: 'current_rank', label: 'Current rank', prompt: "**2/6** And your **current rank** this split?" },
  { key: 'main_role', label: 'Main role', prompt: '**3/6** What is your **main role**? (Top / Jungle / Mid / ADC / Support)' },
  { key: 'main_champs', label: 'Main-role champs', prompt: '**4/6** Which **champions** do you play in that role? Best first.' },
  { key: 'secondary_roles', label: 'Secondary role(s)', prompt: '**5/6** Any **secondary role(s)**? List them, or say "none".' },
  { key: 'secondary_champs', label: 'Secondary champs', prompt: '**6/6** And your **champions** for those secondary roles?' },
] as const

export type QuestionKey = (typeof QUESTIONS)[number]['key']
export type Answers = Partial<Record<QuestionKey, string>>
export type TicketStatus = 'open' | 'trialling' | 'accepted' | 'declined' | 'closed'

export function nextQuestion(answers: Answers) {
  return QUESTIONS.find((q) => !answers[q.key])
}

export const isComplete = (answers: Answers) => nextQuestion(answers) === undefined

/** Discord channel names: lowercase, dashes, max 100 chars. */
export function channelName(status: TicketStatus, username: string): string {
  const prefix = status === 'closed' ? 'closed' : status === 'open' ? 'tryout' : status
  const slug = username
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${prefix}-${slug || 'applicant'}`.slice(0, 100)
}

export const NUDGE_AFTER = 24 * 60 * 60 * 1000

export function nudgeDue(
  t: { answers: Answers; last_activity: number; nudged_at: number | null },
  now: number,
): boolean {
  if (isComplete(t.answers)) return false
  if (t.nudged_at !== null) return false
  return now - t.last_activity > NUDGE_AFTER
}
```

**Step 4: Run tests**

Run: `npm test`
Expected: 4 passing.

**Step 5: Commit**

```bash
git add src/bot/ticketFlow.ts src/bot/ticketFlow.test.ts
git commit -m "Add the pure tryout questionnaire logic"
```

### Task 3: Database table and helpers

**Files:**
- Modify: `src/bot/db.ts` (add table to the big `db.exec`, add `tickets` export at the bottom)

**Step 1: Schema** (inside the existing `db.exec` string, after `settings`)

```sql
  -- One tryout ticket per applicant. Answers land one column at a time so a
  -- restart mid-questionnaire picks up where it left off.
  CREATE TABLE IF NOT EXISTS tryout_tickets (
    channel_id       TEXT PRIMARY KEY,
    discord_id       TEXT NOT NULL,
    username         TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'open',
    peak_rank        TEXT,
    current_rank     TEXT,
    main_role        TEXT,
    main_champs      TEXT,
    secondary_roles  TEXT,
    secondary_champs TEXT,
    summary_message_id TEXT,
    created_at       INTEGER NOT NULL,
    last_activity    INTEGER NOT NULL,
    nudged_at        INTEGER,
    closed_at        INTEGER
  );
  CREATE INDEX IF NOT EXISTS tryout_tickets_user ON tryout_tickets (discord_id, status);
```

**Step 2: Helpers**

```ts
import { QUESTIONS, type Answers, type QuestionKey, type TicketStatus } from './ticketFlow.js'

export type Ticket = {
  channel_id: string
  discord_id: string
  username: string
  status: TicketStatus
  summary_message_id: string | null
  created_at: number
  last_activity: number
  nudged_at: number | null
  closed_at: number | null
} & Record<QuestionKey, string | null>

export function ticketAnswers(t: Ticket): Answers {
  const out: Answers = {}
  for (const q of QUESTIONS) if (t[q.key]) out[q.key] = t[q.key]!
  return out
}

const ANSWER_COLUMNS = new Set<string>(QUESTIONS.map((q) => q.key))

export const tickets = {
  create: (row: { channel_id: string; discord_id: string; username: string }) =>
    db.prepare(`
      INSERT INTO tryout_tickets (channel_id, discord_id, username, created_at, last_activity)
      VALUES (@channel_id, @discord_id, @username, @now, @now)
    `).run({ ...row, now: Date.now() }),
  byChannel: (channelId: string) =>
    db.prepare('SELECT * FROM tryout_tickets WHERE channel_id = ?').get(channelId) as Ticket | undefined,
  /** The one live ticket a person may have. */
  activeFor: (discordId: string) =>
    db.prepare(`SELECT * FROM tryout_tickets WHERE discord_id = ? AND status != 'closed' ORDER BY created_at DESC LIMIT 1`)
      .get(discordId) as Ticket | undefined,
  active: () =>
    db.prepare(`SELECT * FROM tryout_tickets WHERE status != 'closed'`).all() as Ticket[],
  answer(channelId: string, key: QuestionKey, value: string) {
    if (!ANSWER_COLUMNS.has(key)) throw new Error(`Not a question: ${key}`)
    db.prepare(`UPDATE tryout_tickets SET ${key} = ?, last_activity = ? WHERE channel_id = ?`)
      .run(value, Date.now(), channelId)
  },
  setSummary: (channelId: string, messageId: string) =>
    db.prepare('UPDATE tryout_tickets SET summary_message_id = ? WHERE channel_id = ?').run(messageId, channelId),
  setStatus: (channelId: string, status: TicketStatus) =>
    db.prepare(`UPDATE tryout_tickets SET status = ?, closed_at = CASE WHEN ? = 'closed' THEN ? ELSE closed_at END WHERE channel_id = ?`)
      .run(status, status, Date.now(), channelId),
  markNudged: (channelId: string) =>
    db.prepare('UPDATE tryout_tickets SET nudged_at = ? WHERE channel_id = ?').run(Date.now(), channelId),
}
```

**Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

**Step 4: Commit**

```bash
git add src/bot/db.ts && git commit -m "Store tryout tickets in SQLite"
```

### Task 4: Ticket module (Discord wiring)

**Files:**
- Create: `src/bot/tickets.ts`

Exports: `openTicket(guild, member)`, `handleTicketMessage(message)`, `isTicketButton`, `handleTicketButton`, `resumeTickets(client)`, `startTicketNudges(client)`, `TRYOUT_CATEGORY`.

Key rules, all in this one file:

- **Category:** find `'🎯 TRYOUTS'` by name. If missing, throw a clear error (caller reports "ping a captain").
- **Overwrites:** deny `@everyone` ViewChannel; allow applicant `ViewChannel | SendMessages | ReadMessageHistory`; allow each of `STAFF_ROLES` ViewChannel + SendMessages; allow the bot's own member ViewChannel + SendMessages + ManageChannels.
- **Dedupe:** `const inFlight = new Map<string, Promise<TextChannel>>()`. `openTicket` returns `{ channel, created: boolean }`. If `tickets.activeFor(id)` resolves to a channel that still exists → `created: false`. If the row exists but the channel is gone → `setStatus(closed)` and fall through to create.
- **Greeting:** first message in channel: `Hey <@id> — welcome to your tryout. Answer these six in your own words, one message each. A captain will read it once you're done.` then the first prompt. Save `last_activity`.
- **Messages:** `handleTicketMessage`: ignore bots, ignore DMs, look up `tickets.byChannel`, require `message.author.id === ticket.discord_id`, require `status === 'open'` and not complete. Trim content; if empty (attachment only) reply "Text please" and return. Cap at 500 chars. Save with `tickets.answer`, `message.react('✅')`, then either send the next prompt or post the summary.
- **Summary:** `baseEmbed().setColor(GOLD).setTitle('Tryout application').setDescription(<@id>)` with one field per `QUESTIONS` label; add an `op.gg` field from `accounts.mainFor` when linked, otherwise "not registered — run `/register`". Content pings the roles named `Team A Captain`, `Team B Captain`, `LoL Officer` if they exist. Components: one row of buttons `ticket:trialling` (Primary, 🎯), `ticket:accept` (Success, ✅), `ticket:decline` (Danger, 🚫), `ticket:close` (Secondary, 🔒). Save `summary_message_id`.
- **Buttons:** `isStaff` gate → ephemeral refusal "Only staff and captains can do that." Trialling / accept / decline: `setStatus`, `channel.setName(channelName(status, username))`, post `"<@presser> marked this **Accepted**."`, and for accept / decline `member.send(...)` with a short message; on DM failure post "(Couldn't DM them — their DMs are closed, tell them here.)". Close: `setStatus('closed')`, reply ephemerally "Closing.", then `channel.delete('Tryout ticket closed by <tag>')`.
- **Resume:** `resumeTickets` loops `tickets.active()`; for each, fetch the channel (mark closed if 404), and if the ticket is `open` and not complete, look at the last message: if it is not from the bot, re-send the next prompt.
- **Nudges:** `startTicketNudges` runs hourly: for each active ticket where `nudgeDue(...)`, send `"<@id> still here? Whenever you're ready, next up:"` + the prompt, then `markNudged`.

**Step 1: Write the module** (full code in the executing session; the rules above are the spec).

**Step 2: Typecheck**

Run: `npm run typecheck` — clean.

**Step 3: Commit**

```bash
git add src/bot/tickets.ts && git commit -m "Open a private ticket for every tryout and walk them through the questions"
```

### Task 5: Wire into the bot

**Files:**
- Modify: `src/bot/index.ts` (intents, routing, listeners, boot)
- Modify: `src/bot/roles.ts:150-190` (tryout button opens the ticket)

**Steps:**

1. Intents: `[Guilds, GuildMembers, GuildMessages, MessageContent]`.
2. Button routing: `else if (isTicketButton(interaction.customId)) await handleTicketButton(interaction)`.
3. `client.on(Events.MessageCreate, (m) => handleTicketMessage(m).catch((err) => console.error('[tickets] message:', err)))`.
4. `client.on(Events.GuildMemberUpdate, ...)`: if the Tryout role is in `newMember.roles.cache` but not `oldMember.roles.cache`, `openTicket(newMember.guild, newMember)`, errors logged.
5. In `ClientReady`, after `applySeed()`: `await resumeTickets(client)`, and `startTicketNudges(client)` alongside the other jobs.
6. `roles.ts`: on the tryout button when the role was *added*, `await i.deferReply({ flags: Ephemeral })`, call `openTicket`, then `editReply` with `Your tryout ticket is open: <#id>. Answer the questions there when you're ready.` On failure: `Got you the Tryout role, but I couldn't open your ticket — ping a captain.` Also change the embed copy in `rolesEmbed` from "post whenever you're ready" to "the bot opens your ticket straight away".

**Verify:** `npm run typecheck` clean, `npm test` passing. Commit: `"Open tryout tickets from the role button and on manual role grants"`.

### Task 6: Blueprint and explainer

**Files:**
- Modify: `src/structure.ts:228-240` (delete the `tryout-applications` forum entry)
- Modify: `src/bot/tryouts.ts` (rewrite the fields for the ticket flow)
- Modify: `README.md` (mention tickets where tryouts are described, if at all)

New `#tryout-info` fields:

- **Getting in** — hit "I'm here to trial" in #get-roles. You get the Tryout role and the bot opens a private `#tryout-you` channel only you and the captains can see.
- **Then answer six questions** — peak rank, current rank, main role and champs, secondary role(s) and champs. One message each, in your own words. Run `/register` first and your op.gg goes on the card automatically.
- **What happens next** — a captain reads it and replies in your ticket, usually within a few days. It gets marked Trialling, then Accepted or Declined, and you get a DM either way.
- Keep **What actually matters** and **A no is not forever** as they are.

**Verify:** `npm run typecheck`. Commit: `"Replace the application forum with tickets in the blueprint and explainer"`.

### Task 7: Local end-to-end check, then deploy

1. Check nothing else is running: `ps -eo pid,lstart,command | grep '[t]sx src/bot/index.ts'`.
2. Railway holds the token too. Stop the Railway service first (`railway service` → pause, or `railway down`? No — simplest is `railway variables --set DISCORD_TOKEN=`... **do not**). Instead: test locally against a throwaway `DATABASE_PATH=./data/test.db` while the Railway instance is up is unsafe (interaction race). So: run locally **only for the message/ticket path** for a couple of minutes, accept that slash commands may flip, then kill it. Buttons and messages both race too. Safer order: deploy to Railway first, test there, read `railway logs`.
3. `railway up --detach`, then `railway logs` until "Logged in as".
4. In Discord: press "I'm here to trial" on a test account or the owner account, answer the six questions, check the card, press each button, Close.
5. Delete the old `#tryout-applications` forum by hand, run `npm run post-tryouts` and `npm run post-roles` (bot stays on Railway; these scripts use their own short-lived client and are safe).
6. Merge: `git checkout main && git merge tryout-tickets && git push`.
