/**
 * Royal Bears — applicants sheet.
 *
 * Paste this into the sheet's Apps Script (Extensions → Apps Script), set
 * SECRET to the same value as the bot's GOOGLE_SHEET_SECRET, then
 * Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 * Give the bot the web-app URL. It POSTs the whole table on every change and
 * this script redraws the "Applicants" tab, formatting included.
 */

const SECRET = 'CHANGE-ME'
const TAB = 'Applicants'

const BRAND = '#2b5fd9'
const STATUS_COLOURS = {
  accepted: '#d9f2e3',
  trialling: '#fff3cd',
  declined: '#f8d7da',
  open: '#e8eefc',
  closed: '#e9ecef',
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents)
  if (payload.secret !== SECRET) return json_({ ok: false, error: 'bad secret' })

  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ss.getSheetByName(TAB) || ss.insertSheet(TAB, 0)
  redraw_(sheet, payload.header, payload.rows, payload.updated)
  return json_({ ok: true, rows: payload.rows.length })
}

function redraw_(sheet, header, rows, updated) {
  sheet.clear()
  sheet.clearConditionalFormatRules()
  sheet.setFrozenRows(2)

  const cols = header.length
  const OPGG = header.indexOf('op.gg') + 1
  const IGN = header.indexOf('IGN') + 1
  const STATUS = header.indexOf('Status') + 1
  const APPLIED = header.indexOf('Applied') + 1
  const TIER = header.indexOf('Tier list') + 1

  // Title row
  sheet.getRange(1, 1, 1, cols).merge()
  sheet.getRange(1, 1)
    .setValue('Royal Bears — tryout applicants   ·   ' + rows.length + ' applications   ·   updated ' + fmt_(updated))
    .setFontFamily('Arial').setFontSize(13).setFontWeight('bold').setFontColor('#ffffff')
    .setBackground(BRAND).setVerticalAlignment('middle')
  sheet.setRowHeight(1, 40)

  // Header row
  sheet.getRange(2, 1, 1, cols).setValues([header])
    .setFontFamily('Arial').setFontWeight('bold').setFontColor('#ffffff')
    .setBackground('#1e3f99').setVerticalAlignment('middle')
  sheet.setRowHeight(2, 30)

  if (!rows.length) {
    sheet.getRange(3, 1).setValue('No applications yet.').setFontFamily('Arial').setFontStyle('italic')
    widths_(sheet, header)
    return
  }

  // Body: text as-is, Applied as a real date, op.gg as a hyperlink on the IGN, tier list as a picture.
  const body = rows.map(function (r) {
    return r.map(function (v, i) {
      if (i + 1 === APPLIED) return v ? new Date(v) : ''
      if (i + 1 === TIER) return v ? '=IMAGE("' + v + '", 4, 150, 260)' : ''
      if (i + 1 === OPGG) return ''
      return v
    })
  })
  const range = sheet.getRange(3, 1, rows.length, cols)
  range.setValues(body).setFontFamily('Arial').setFontSize(10).setVerticalAlignment('middle').setWrap(true)
  sheet.getRange(3, APPLIED, rows.length, 1).setNumberFormat('dd mmm yyyy')

  rows.forEach(function (r, n) {
    const row = 3 + n
    sheet.setRowHeight(row, r[TIER - 1] ? 160 : 28)
    if (r[OPGG - 1]) {
      const rich = SpreadsheetApp.newRichTextValue().setText(r[IGN - 1] || r[OPGG - 1]).setLinkUrl(r[OPGG - 1]).build()
      sheet.getRange(row, IGN).setRichTextValue(rich)
      sheet.getRange(row, OPGG).setValue(r[OPGG - 1]).setFontColor('#9aa0a6').setFontSize(8)
    }
  })

  // Status pills
  const statusRange = sheet.getRange(3, STATUS, rows.length, 1)
  statusRange.setHorizontalAlignment('center').setFontWeight('bold')
  const rules = Object.keys(STATUS_COLOURS).map(function (s) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextStartsWith(s).setBackground(STATUS_COLOURS[s]).setRanges([statusRange]).build()
  })
  sheet.setConditionalFormatRules(rules)

  // Banding + borders
  sheet.getRange(3, 1, rows.length, cols).setBorder(true, true, true, true, true, true, '#dfe3ea', SpreadsheetApp.BorderStyle.SOLID)
  for (var i = 0; i < rows.length; i += 2) sheet.getRange(3 + i, 1, 1, cols).setBackground('#f7f9fd')
  widths_(sheet, header)
}

function widths_(sheet, header) {
  const w = {
    'Discord name': 140, 'IGN': 170, 'op.gg': 60, 'Peak rank': 100, 'Current rank': 100, 'Year': 60,
    'Team': 80, 'Main role': 90, 'Open to other roles?': 180, 'Status': 110, 'Applied': 100, 'Tier list': 270,
  }
  header.forEach(function (h, i) { sheet.setColumnWidth(i + 1, w[h] || 120) })
}

function fmt_(iso) {
  return Utilities.formatDate(new Date(iso), 'Europe/London', 'd MMM yyyy, HH:mm')
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON)
}

/** Run once from the editor to check the sheet draws: fills it with two example rows. */
function testDraw() {
  const ss = SpreadsheetApp.getActiveSpreadsheet()
  const sheet = ss.getSheetByName(TAB) || ss.insertSheet(TAB, 0)
  redraw_(sheet,
    ['Discord name', 'IGN', 'op.gg', 'Peak rank', 'Current rank', 'Year', 'Team', 'Main role', 'Open to other roles?', 'Status', 'Applied', 'Tier list'],
    [['draatini', 'draatini#EUW', 'https://op.gg/summoners/euw/draatini-EUW', 'Emerald 1', 'Emerald 3', '2nd', 'A and B', 'Mid', 'Support', 'accepted', new Date().toISOString(), ''],
     ['connorgunn', 'Connor#0001', 'https://op.gg/summoners/euw/Connor-0001', 'Diamond 4', 'Diamond 4', '3rd', 'B', 'Top', 'no', 'open', new Date().toISOString(), '']],
    new Date().toISOString())
}
