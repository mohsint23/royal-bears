/**
 * Mirrors the applicant list into a Google Sheet.
 *
 * The bot cannot log in to Google, so the sheet runs a small Apps Script
 * (google/applicants-sheet.gs) deployed as a web app. The bot POSTs the whole
 * table plus a shared secret; the script rewrites and formats the sheet.
 * Best-effort: a failure is logged and never blocks the Discord side.
 */

import { config } from './config.js'
import { accounts, ticketAnswers, type Ticket } from './db.js'
import { opggUrl } from './tickets.js'
import { isComplete, QUESTIONS } from './ticketFlow.js'
import { tierListUrl } from './web.js'

export const SHEET_COLUMNS = [
  'Discord name', 'IGN', 'op.gg', 'Peak rank', 'Current rank', 'Year', 'Team',
  'Main role', 'Open to other roles?', 'Status', 'Applied', 'Tier list',
] as const

export function sheetRow(t: Ticket): (string | number)[] {
  const link = opggUrl(t.riot_id, accounts.mainFor(t.discord_id))
  const done = Object.keys(ticketAnswers(t)).length
  return [
    t.username,
    link?.label ?? t.riot_id ?? '',
    link?.url ?? '',
    t.peak_rank ?? '',
    t.current_rank ?? '',
    t.year ?? '',
    t.team ?? '',
    t.main_role ?? '',
    t.secondary_roles ?? '',
    isComplete(ticketAnswers(t)) ? t.status : `answering (${done}/${QUESTIONS.length})`,
    new Date(t.created_at).toISOString(),
    tierListUrl(t.tier_list) ?? '',
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
