/**
 * Royal Bears — applicants sheet.
 *
 * Paste this into the sheet's Apps Script (Extensions → Apps Script), set
 * SECRET to the same value as the bot's GOOGLE_SHEET_SECRET, save, then:
 *   1. run `setup` once from the editor (installs the on-edit trigger, asks for
 *      permission the first time), and
 *   2. Deploy → Manage deployments → pencil → Version: New version → Deploy.
 *
 * The bot POSTs the whole table on every change and doPost redraws the
 * "Applicants" tab. When someone edits a cell here, onSheetEdit sends that one
 * change back to the bot, which updates the ticket and the Discord board.
 */

const SECRET = 'CHANGE-ME'
const BOT_URL = 'https://royal-bears-production.up.railway.app'
const TAB = 'Applicants'

const BRAND = '#2b5fd9'
const HEADER_BG = '#1e3f99'
const STATUS_COLOURS = {
  accepted: '#c8f0d6',
  trialling: '#ffe9a8',
  declined: '#f6c6cb',
  open: '#dde6fb',
  closed: '#e2e5ea',
}
const STATUSES = ['open', 'trialling', 'accepted', 'declined', 'closed']
const TEAMS = ['A', 'B', 'A and B']

/** Columns a captain may edit here; anything else is redrawn from the bot. */
const EDITABLE = ['IGN', 'Peak rank', 'Current rank', 'Year', 'Team', 'Main role', 'Open to other roles?', 'Status', 'Notes']

// ---------------------------------------------------------------------------
// Bot → sheet

function doPost(e) {
  const payload = JSON.parse(e.postData.contents)
  if (payload.secret !== SECRET) return json_({ ok: false, error: 'bad secret' })

  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ss.getSheetByName(TAB) || ss.insertSheet(TAB, 0)
  redraw_(sheet, payload.header, payload.rows, payload.updated)
  return json_({ ok: true, rows: payload.rows.length })
}

function redraw_(sheet, header, rows, updated) {
  const lock = LockService.getDocumentLock()
  lock.waitLock(20000)
  try {
    sheet.clear()
    sheet.clearConditionalFormatRules()
    sheet.getDataRange().clearDataValidations()
    sheet.setFrozenRows(2)
    sheet.setFrozenColumns(1)

    const cols = header.length
    const col = function (name) { return header.indexOf(name) + 1 }
    const IGN = col('IGN'), OPGG = col('op.gg'), STATUS = col('Status'), TEAM = col('Team')
    const APPLIED = col('Applied'), TIER = col('Tier list'), TICKET = col('Ticket'), NOTES = col('Notes')

    // Title bar
    sheet.getRange(1, 1, 1, cols).merge()
    sheet.getRange(1, 1)
      .setValue('Royal Bears · tryout applicants · ' + rows.length + (rows.length === 1 ? ' application' : ' applications') + ' · updated ' + fmt_(updated))
      .setFontFamily('Arial').setFontSize(13).setFontWeight('bold').setFontColor('#ffffff')
      .setBackground(BRAND).setVerticalAlignment('middle')
    sheet.setRowHeight(1, 40)

    // Header row
    sheet.getRange(2, 1, 1, cols).setValues([header])
      .setFontFamily('Arial').setFontWeight('bold').setFontColor('#ffffff')
      .setBackground(HEADER_BG).setVerticalAlignment('middle')
    sheet.setRowHeight(2, 30)

    if (!rows.length) {
      sheet.getRange(3, 1).setValue('No finished applications yet.').setFontFamily('Arial').setFontStyle('italic')
      layout_(sheet, header)
      return
    }

    // Body. IGN becomes a link, Applied a real date, Tier list a picture.
    const body = rows.map(function (r) {
      return r.map(function (v, i) {
        if (i + 1 === APPLIED) return v ? new Date(v) : ''
        if (i + 1 === TIER) return v ? '=IMAGE("' + v + '", 1)' : ''
        return v
      })
    })
    const range = sheet.getRange(3, 1, rows.length, cols)
    range.setValues(body).setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle').setWrap(true)
    sheet.getRange(3, APPLIED, rows.length, 1).setNumberFormat('d mmm yyyy').setHorizontalAlignment('center')
    sheet.getRange(3, TEAM, rows.length, 1).setHorizontalAlignment('center')

    rows.forEach(function (r, n) {
      const row = 3 + n
      sheet.setRowHeight(row, r[TIER - 1] ? 150 : 34)
      if (r[OPGG - 1]) {
        const rich = SpreadsheetApp.newRichTextValue().setText(r[IGN - 1] || 'op.gg').setLinkUrl(r[OPGG - 1]).build()
        sheet.getRange(row, IGN).setRichTextValue(rich)
      }
    })

    // Dropdowns, so a typo can never reach the bot.
    sheet.getRange(3, STATUS, rows.length, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build())
      .setHorizontalAlignment('center').setFontWeight('bold')
    sheet.getRange(3, TEAM, rows.length, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(TEAMS, true).setAllowInvalid(false).build())

    // Status colours
    const statusRange = sheet.getRange(3, STATUS, rows.length, 1)
    sheet.setConditionalFormatRules(Object.keys(STATUS_COLOURS).map(function (s) {
      return SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(s).setBackground(STATUS_COLOURS[s]).setRanges([statusRange]).build()
    }))

    // Notes column is the one meant for typing: give it a hint of colour.
    sheet.getRange(3, NOTES, rows.length, 1).setBackground('#fffbe6')

    // Banding and borders
    sheet.getRange(3, 1, rows.length, cols).setBorder(true, true, true, true, true, true, '#dfe3ea', SpreadsheetApp.BorderStyle.SOLID)
    for (var i = 0; i < rows.length; i += 2) {
      sheet.getRange(3 + i, 1, 1, cols).setBackground('#f5f7fc')
      sheet.getRange(3 + i, NOTES).setBackground('#fff7d6')
    }
    layout_(sheet, header)
  } finally {
    lock.releaseLock()
  }
}

function layout_(sheet, header) {
  const w = {
    'Discord name': 130, 'IGN': 160, 'Peak rank': 100, 'Current rank': 100, 'Year': 60, 'Team': 80,
    'Main role': 90, 'Open to other roles?': 170, 'Status': 100, 'Notes': 240, 'Applied': 95, 'Tier list': 280,
  }
  header.forEach(function (h, i) {
    sheet.setColumnWidth(i + 1, w[h] || 120)
    if (h === 'op.gg' || h === 'Ticket') sheet.hideColumns(i + 1)
  })
}

// ---------------------------------------------------------------------------
// Sheet → bot

/** Installable on-edit trigger (simple triggers cannot call out to the web). */
function onSheetEdit(e) {
  const sheet = e.range.getSheet()
  if (sheet.getName() !== TAB || e.range.getRow() < 3 || e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return
  const header = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0]
  const name = header[e.range.getColumn() - 1]
  if (EDITABLE.indexOf(name) === -1) return
  const ticket = sheet.getRange(e.range.getRow(), header.indexOf('Ticket') + 1).getValue()
  if (!ticket) return

  const res = UrlFetchApp.fetch(BOT_URL + '/sheet-edit', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ secret: SECRET, ticket: String(ticket), header: name, value: String(e.range.getValue()) }),
    muteHttpExceptions: true,
  })
  const body = JSON.parse(res.getContentText() || '{}')
  if (body.ok) {
    e.range.setNote('Saved to Discord ' + fmt_(new Date().toISOString()))
  } else {
    e.range.setNote('NOT saved: ' + (body.error || res.getResponseCode()))
    SpreadsheetApp.getActiveSpreadsheet().toast('Not saved: ' + (body.error || res.getResponseCode()), 'Royal Bear', 6)
  }
}

/** Run once from the editor. Installs the edit trigger (replacing any old one). */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onSheetEdit') ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onEdit().create()
  SpreadsheetApp.getActiveSpreadsheet().toast('Edit trigger installed. Edits now flow back to Discord.', 'Royal Bear', 6)
}

// ---------------------------------------------------------------------------

function fmt_(iso) {
  return Utilities.formatDate(new Date(iso), 'Europe/London', 'd MMM yyyy, HH:mm')
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}

/** Run from the editor to see the styling with two example rows. */
function testDraw() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ss.getSheetByName(TAB) || ss.insertSheet(TAB, 0)
  const header = ['Discord name', 'IGN', 'Peak rank', 'Current rank', 'Year', 'Team', 'Main role', 'Open to other roles?', 'Status', 'Notes', 'Applied', 'Tier list', 'op.gg', 'Ticket']
  redraw_(sheet, header, [
    ['draatini', 'draatini#EUW', 'Emerald 1', 'Emerald 3', '2nd', 'A and B', 'Mid', 'Support', 'accepted', 'Solid comms', new Date().toISOString(), '', 'https://op.gg/summoners/euw/draatini-EUW', 'example-1'],
    ['connorgunn', 'Connor#0001', 'Diamond 4', 'Diamond 4', '3rd', 'B', 'Top', 'no', 'open', '', new Date().toISOString(), '', 'https://op.gg/summoners/euw/Connor-0001', 'example-2'],
  ], new Date().toISOString())
}
