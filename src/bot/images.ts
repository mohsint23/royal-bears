/**
 * Storage for uploaded tier-list screenshots.
 *
 * Discord's attachment URLs are signed and expire within about a day, so
 * keeping the link would leave every pool image broken by tomorrow. Instead the
 * file is copied onto disk next to the database — which on Railway means the
 * mounted volume — and re-attached when someone views the pool.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Attachment } from 'discord.js'
import { config } from './config.js'
import { poolImages, WHOLE_POOL } from './db.js'

const DIRECTORY = join(dirname(config.databasePath), 'pool-images')
mkdirSync(DIRECTORY, { recursive: true })

export const MAX_BYTES = 8 * 1024 * 1024

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export type SaveFailure = { ok: false; reason: string }
export type SaveSuccess = { ok: true; file: string }

export type Fetched = { ok: true; bytes: Buffer; extension: string }

/** Downloads a Discord attachment, checking type and size first. */
export async function fetchImage(attachment: Attachment): Promise<Fetched | SaveFailure> {
  const type = attachment.contentType?.split(';')[0]?.trim() ?? ''
  const extension = EXTENSIONS[type]

  if (!extension) {
    return { ok: false, reason: 'That needs to be a PNG, JPG, WEBP or GIF image.' }
  }
  if (attachment.size > MAX_BYTES) {
    return { ok: false, reason: `That image is ${(attachment.size / 1024 / 1024).toFixed(1)} MB. The limit is 8 MB.` }
  }

  const response = await fetch(attachment.url)
  if (!response.ok) return { ok: false, reason: 'Could not download that image from Discord. Try again.' }

  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength > MAX_BYTES) return { ok: false, reason: 'That image is over the 8 MB limit.' }
  return { ok: true, bytes, extension }
}

/**
 * Copies an uploaded image into storage. The stored name is generated rather
 * than taken from the upload, so a hostile filename cannot escape the folder.
 */
export async function saveImage(
  discordId: string,
  position: string,
  attachment: Attachment,
): Promise<SaveSuccess | SaveFailure> {
  const fetched = await fetchImage(attachment)
  if (!fetched.ok) return fetched

  const file = `${discordId}-${position}.${fetched.extension}`
  writeFileSync(join(DIRECTORY, file), fetched.bytes)

  // A re-upload in a different format would otherwise leave the old file behind.
  const previous = poolImages.get(discordId, position)
  if (previous && previous.file !== file) discard(previous.file)

  poolImages.save(discordId, position, file)
  return { ok: true, file }
}

export function pathFor(file: string): string {
  return join(DIRECTORY, file)
}

export function discard(file: string) {
  rmSync(join(DIRECTORY, file), { force: true })
}

export function removeImage(discordId: string, position: string): boolean {
  const existing = poolImages.get(discordId, position)
  if (!existing) return false
  discard(existing.file)
  poolImages.remove(discordId, position)
  return true
}

export { WHOLE_POOL }
