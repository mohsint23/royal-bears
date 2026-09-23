/**
 * Mirrors the applicant list into a Google Sheet.
 *
 * The bot cannot log in to Google, so the sheet runs a small Apps Script
 * (google/applicants-sheet.gs) deployed as a web app. The bot POSTs the whole
 * table plus a shared secret; the script rewrites and formats the sheet.
 * Best-effort: a failure is logged and never blocks the Discord side.
 */

import type { Guild } from 'discord.js'
import { config } from './config.js'
import { accounts, ticketAnswers, tickets, type Ticket } from './db.js'
import { applyStatus, opggUrl } from './tickets.js'
import { isComplete, parseRiotId, parseTeam, QUESTIONS, type TicketStatus } from './ticketFlow.js'
import { tierListUrl } from './web.js'

export const SHEET_COLUMNS = [
  'Discord name', 'IGN', 'Peak rank', 'Current rank', 'Year', 'Team', 'Main role',
  'Open to other roles?', 'Status', 'Notes', 'Applied', 'Tier list', 'op.gg', 'Ticket',
] as const

/** Sheet header → database column, for edits coming back from the sheet. */
export const EDITABLE_HEADERS: Record<string, (typeof tickets.EDITABLE)[number] | 'status'> = {
  IGN: 'riot_id',
  'Peak rank': 'peak_rank',
  'Current rank': 'current_rank',
  Year: 'year',
  Team: 'team',
  'Main role': 'main_role',
  'Open to other roles?': 'secondary_roles',
  Status: 'status',
  Notes: 'notes',
}

export function sheetRow(t: Ticket): (string | number)[] {
  const link = opggUrl(t.riot_id, accounts.mainFor(t.discord_id))
  const done = Object.keys(ticketAnswers(t)).length
  return [
    t.username,
    t.riot_id ?? link?.label ?? '',
    t.peak_rank ?? '',
    t.current_rank ?? '',
    t.year ?? '',
    t.team ?? '',
    t.main_role ?? '',
    t.secondary_roles ?? '',
    isComplete(ticketAnswers(t)) ? t.status : `answering (${done}/${QUESTIONS.length})`,
    t.notes ?? '',
    new Date(t.created_at).toISOString(),
    tierListUrl(t.tier_list) ?? '',
    link?.url ?? '',
    t.channel_id,
  ]
}

export const sheetConfigured = () => Boolean(config.sheetWebhook && config.sheetSecret)

export async function pushToGoogleSheet(rows: Ticket[]): Promise<void> {
  if (!sheetConfigured()) return
  const body = JSON.stringify({
    secret: config.sheetSecret,
    updated: new Date().toISOString(),
    header: SHEET_COLUMNS,
    rows: rows.map(sheetRow),
  })
  const res = await fetch(config.sheetWebhook!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    redirect: 'follow', // Apps Script answers a POST with a 302 to the output
  })
  const text = await res.text()
  if (!res.ok || !text.includes('"ok":true')) throw new Error(`Sheet webhook ${res.status}: ${text.slice(0, 200)}`)
}

const STATUSES: TicketStatus[] = ['open', 'trialling', 'accepted', 'declined', 'closed']

/**
 * A cell changed in the sheet. Applies it to the ticket and says what was
 * stored, or why not. The caller re-renders Discord; the sheet is left alone
 * so the person editing it is not interrupted by a redraw.
 */
export async function applySheetEdit(
  guild: Guild,
  edit: { ticket: string; header: string; value: string },
): Promise<{ ok: true; stored: string | null } | { ok: false; error: string }> {
  const column = EDITABLE_HEADERS[edit.header]
  if (!column) return { ok: false, error: `"${edit.header}" is not editable from the sheet` }
  const ticket = tickets.byChannel(edit.ticket)
  if (!ticket) return { ok: false, error: 'unknown ticket' }

  const raw = edit.value.trim()
  if (column === 'status') {
    const status = raw.toLowerCase() as TicketStatus
    if (!STATUSES.includes(status)) return { ok: false, error: `status must be one of ${STATUSES.join(', ')}` }
    if (status !== ticket.status) await applyStatus(guild, ticket, status)
    return { ok: true, stored: status }
  }
  let value: string | null = raw || null
  if (column === 'team' && value) {
    const team = parseTeam(value)
    if (!team) return { ok: false, error: 'team must be A, B or A and B' }
    value = team
  }
  if (column === 'riot_id' && value && !parseRiotId(value)) return { ok: false, error: 'IGN must be Name#TAG' }
  tickets.edit(ticket.channel_id, column, value)
  return { ok: true, stored: value }
}
