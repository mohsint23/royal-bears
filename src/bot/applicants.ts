/**
 * The applicants spreadsheet: one row per tryout ticket, built from the
 * database on demand so it is never out of date. Served by /applicants in
 * Discord and by `npm run export-applicants` locally.
 */

import { existsSync, readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { accounts, tickets, type Ticket } from './db.js'
import { opggUrl, tierListPath } from './tickets.js'

export const COLUMNS = [
  { header: 'Discord name', key: 'discord', width: 20 },
  { header: 'IGN', key: 'ign', width: 22 },
  { header: 'Peak rank', key: 'peak', width: 16 },
  { header: 'op.gg', key: 'opgg', width: 44 },
  { header: 'Year', key: 'year', width: 10 },
  { header: 'Team', key: 'team', width: 10 },
  { header: 'Current rank', key: 'current', width: 16 },
  { header: 'Main role', key: 'mainRole', width: 12 },
  { header: 'Main champs', key: 'mainChamps', width: 30 },
  { header: 'Secondary role(s)', key: 'secRoles', width: 16 },
  { header: 'Secondary champs', key: 'secChamps', width: 30 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'Applied', key: 'applied', width: 14 },
  { header: 'Tier list', key: 'tier', width: 38 },
] as const

/** Picture size in the sheet, in pixels. Rows holding one are made this tall. */
const PICTURE = { width: 260, height: 150 }
const EMBEDDABLE = new Set(['png', 'jpg', 'jpeg', 'gif'])

export function applicantRow(t: Ticket) {
  const link = opggUrl(t.riot_id, accounts.mainFor(t.discord_id))
  return {
    discord: t.username,
    ign: link?.label ?? t.riot_id ?? '',
    peak: t.peak_rank ?? '',
    opgg: link ? ({ text: link.url, hyperlink: link.url } as ExcelJS.CellHyperlinkValue) : '',
    year: t.year ?? '',
    team: t.team ?? '',
    current: t.current_rank ?? '',
    mainRole: t.main_role ?? '',
    mainChamps: t.main_champs ?? '',
    secRoles: t.secondary_roles ?? '',
    secChamps: t.secondary_champs ?? '',
    status: t.status,
    applied: new Date(t.created_at),
    tier: t.tier_list ? '' : '',
  }
}

export async function applicantsWorkbook(rows: Ticket[] = tickets.all()): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Royal Bear'
  const ws = wb.addWorksheet('Applicants', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = COLUMNS.map((c) => ({ ...c, style: { font: { name: 'Arial', size: 11 } } }))

  const head = ws.getRow(1)
  head.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B5FD9' } }
  head.alignment = { vertical: 'middle' }

  const tierCol = COLUMNS.findIndex((c) => c.key === 'tier')
  for (const t of rows) {
    const row = ws.addRow(applicantRow(t))
    row.getCell('applied').numFmt = 'dd/mm/yyyy'
    row.alignment = { vertical: 'top', wrapText: true }
    const opgg = row.getCell('opgg')
    if (typeof opgg.value === 'object' && opgg.value && 'hyperlink' in opgg.value) {
      opgg.font = { name: 'Arial', size: 11, color: { argb: 'FF0563C1' }, underline: true }
    }

    // The tier list goes in as a picture anchored to its cell. Excel cannot
    // show WEBP, so that case gets the file name instead.
    const ext = t.tier_list?.split('.').pop()?.toLowerCase()
    const path = t.tier_list ? tierListPath(t.tier_list) : undefined
    if (path && ext && existsSync(path)) {
      if (EMBEDDABLE.has(ext)) {
        const id = wb.addImage({ buffer: readFileSync(path) as unknown as ExcelJS.Buffer, extension: ext === 'jpg' ? 'jpeg' : (ext as 'png' | 'jpeg' | 'gif') })
        ws.addImage(id, { tl: { col: tierCol, row: row.number - 1 }, ext: PICTURE })
        row.height = PICTURE.height * 0.75 // points, not pixels
      } else {
        row.getCell('tier').value = `uploaded as .${ext} — not embeddable`
      }
    } else if (t.tier_list) {
      row.getCell('tier').value = 'file missing'
    }
  }
  ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + COLUMNS.length)}1` }

  return Buffer.from(await wb.xlsx.writeBuffer())
}

export const applicantsFilename = () => `royal-bears-applicants-${new Date().toISOString().slice(0, 10)}.xlsx`
