/**
 * The applicants spreadsheet: one row per tryout ticket, built from the
 * database on demand so it is never out of date. Served by /applicants in
 * Discord and by `npm run export-applicants` locally.
 */

import ExcelJS from 'exceljs'
import { accounts, tickets, type Ticket } from './db.js'
import { opggUrl } from './tickets.js'

export const COLUMNS = [
  { header: 'Discord name', key: 'discord', width: 20 },
  { header: 'IGN', key: 'ign', width: 22 },
  { header: 'Peak rank', key: 'peak', width: 16 },
  { header: 'op.gg', key: 'opgg', width: 44 },
  { header: 'Year', key: 'year', width: 10 },
  { header: 'Current rank', key: 'current', width: 16 },
  { header: 'Main role', key: 'mainRole', width: 12 },
  { header: 'Main champs', key: 'mainChamps', width: 30 },
  { header: 'Secondary role(s)', key: 'secRoles', width: 16 },
  { header: 'Secondary champs', key: 'secChamps', width: 30 },
  { header: 'Status', key: 'status', width: 12 },
  { header: 'Applied', key: 'applied', width: 14 },
] as const

export function applicantRow(t: Ticket) {
  const link = opggUrl(t.riot_id, accounts.mainFor(t.discord_id))
  return {
    discord: t.username,
    ign: link?.label ?? t.riot_id ?? '',
    peak: t.peak_rank ?? '',
    opgg: link ? ({ text: link.url, hyperlink: link.url } as ExcelJS.CellHyperlinkValue) : '',
    year: t.year ?? '',
    current: t.current_rank ?? '',
    mainRole: t.main_role ?? '',
    mainChamps: t.main_champs ?? '',
    secRoles: t.secondary_roles ?? '',
    secChamps: t.secondary_champs ?? '',
    status: t.status,
    applied: new Date(t.created_at),
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

  for (const t of rows) {
    const row = ws.addRow(applicantRow(t))
    row.getCell('applied').numFmt = 'dd/mm/yyyy'
    const opgg = row.getCell('opgg')
    if (typeof opgg.value === 'object' && opgg.value && 'hyperlink' in opgg.value) {
      opgg.font = { name: 'Arial', size: 11, color: { argb: 'FF0563C1' }, underline: true }
    }
  }
  ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + COLUMNS.length)}1` }

  return Buffer.from(await wb.xlsx.writeBuffer())
}

export const applicantsFilename = () => `royal-bears-applicants-${new Date().toISOString().slice(0, 10)}.xlsx`
