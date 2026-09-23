/**
 * A very small web server with one job: serving tier-list images so the
 * Google Sheet can show them with =IMAGE(). The URLs carry a token derived
 * from the bot secret, so they are unguessable but need no login.
 */

import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { config } from './config.js'
import { tierListPath } from './tickets.js'

const TOKEN = createHash('sha256').update(`tier-lists:${config.token}`).digest('hex').slice(0, 24)
const FILE = /^[0-9]{5,25}\.(png|jpe?g|webp|gif)$/
const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

/** Public URL for a stored tier list, or undefined when the bot has no public domain. */
export function tierListUrl(file: string | null): string | undefined {
  if (!file || !config.publicUrl || !FILE.test(file)) return undefined
  return `${config.publicUrl}/tier-lists/${TOKEN}/${file}`
}

export function startWeb() {
  if (!config.port) return
  createServer((req, res) => {
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
