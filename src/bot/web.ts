/**
 * A very small web server with one job: serving tier-list images so the
 * Google Sheet can show them with =IMAGE(). The URLs carry a token derived
 * from the bot secret, so they are unguessable but need no login.
 */

import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import type { Client } from 'discord.js'
import { config } from './config.js'
import { refreshPlayerDatabase } from './playerDatabase.js'
import { applySheetEdit } from './sheet.js'
import { tierListPath } from './tickets.js'

const TOKEN = createHash('sha256').update(`tier-lists:${config.token}`).digest('hex').slice(0, 24)
const FILE = /^[0-9]{5,25}\.(png|jpe?g|webp|gif)$/
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

/** Public URL for a stored tier list, or undefined when the bot has no public domain. */
export function tierListUrl(file: string | null): string | undefined {
  if (!file || !config.publicUrl || !FILE.test(file)) return undefined
  return `${config.publicUrl}/tier-lists/${TOKEN}/${file}`
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk; if (data.length > 64 * 1024) req.destroy() })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

export function startWeb(client: Client) {
  if (!config.port) return
  createServer(async (req, res) => {
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(body))
    }

    // Edits typed into the Google Sheet, forwarded by its Apps Script trigger.
    if (req.method === 'POST' && req.url === '/sheet-edit') {
      try {
        const body = JSON.parse(await readBody(req)) as { secret?: string; ticket?: string; header?: string; value?: string }
        if (!config.sheetSecret || body.secret !== config.sheetSecret) return reply(403, { ok: false, error: 'bad secret' })
        if (!body.ticket || !body.header) return reply(400, { ok: false, error: 'ticket and header required' })
        const guild = await client.guilds.fetch(config.guildId)
        const result = await applySheetEdit(guild, { ticket: body.ticket, header: body.header, value: String(body.value ?? '') })
        if (result.ok) refreshPlayerDatabase(guild, { pushSheet: false }).catch((err) => console.error('[player-db] after sheet edit:', err))
        console.log(`[sheet] edit ${body.header} on ${body.ticket}: ${result.ok ? `stored ${JSON.stringify(result.stored)}` : result.error}`)
        return reply(result.ok ? 200 : 422, result)
      } catch (err) {
        console.error('[sheet] edit failed:', err)
        return reply(500, { ok: false, error: 'internal' })
      }
    }

    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('Royal Bear is up.')
      return
    }
    const match = /^\/tier-lists\/([a-f0-9]{24})\/([^/]+)$/.exec(req.url ?? '')
    if (!match) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
      return
    }
    const [, token, file] = match
    if (token !== TOKEN || !FILE.test(file!) || !existsSync(tierListPath(file!))) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
      return
    }
    res.writeHead(200, {
      'Content-Type': TYPES[file!.split('.').pop()!] ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=300',
    })
    createReadStream(tierListPath(file!)).pipe(res)
  }).listen(config.port, () => console.log(`Web server on :${config.port}${config.publicUrl ? ` (${config.publicUrl})` : ''}`))
}
