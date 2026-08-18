/**
 * Riot API client.
 *
 * The bot runs on a development key, which Riot expires every 24 hours. Rather
 * than crash when that happens, the client raises {@link KeyExpiredError}, and
 * whoever is polling pauses and asks staff to run /setkey.
 */

import { config } from './config.js'
import { settings } from './db.js'

const KEY_SETTING = 'riot_api_key'

export class RiotError extends Error {
  constructor(readonly status: number, readonly url: string, message: string) {
    super(message)
  }
}

/** Thrown on 401/403: the key is expired, revoked, or was never set. */
export class KeyExpiredError extends RiotError {}

export function getKey(): string | undefined {
  return settings.get(KEY_SETTING) ?? process.env.RIOT_API_KEY ?? undefined
}

export function setKey(key: string) {
  settings.set(KEY_SETTING, key.trim())
}

export function hasKey(): boolean {
  return Boolean(getKey())
}

/**
 * Development keys allow 20 requests/second and 100 every 2 minutes. We stay
 * comfortably inside both, and back off properly when Riot says to.
 */
const RATE = { perSecond: 15, perTwoMinutes: 90 }
let recent: number[] = []

async function throttle() {
  for (;;) {
    const now = Date.now()
    recent = recent.filter((t) => now - t < 120_000)
    const lastSecond = recent.filter((t) => now - t < 1_000).length
    if (recent.length < RATE.perTwoMinutes && lastSecond < RATE.perSecond) {
      recent.push(now)
      return
    }
    const waitFor = recent.length >= RATE.perTwoMinutes ? 120_000 - (now - recent[0]!) + 50 : 1_000
    await new Promise((r) => setTimeout(r, Math.max(waitFor, 50)))
  }
}

async function call<T>(host: string, path: string): Promise<T> {
  const key = getKey()
  const url = `https://${host}${path}`
  if (!key) throw new KeyExpiredError(401, url, 'No Riot API key set. Run /setkey.')

  for (let attempt = 0; ; attempt++) {
    await throttle()
    const res = await fetch(url, { headers: { 'X-Riot-Token': key } })

    if (res.ok) return (await res.json()) as T

    if (res.status === 429 && attempt < 3) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? 5)
      await new Promise((r) => setTimeout(r, (retryAfter + 1) * 1000))
      continue
    }
    if (res.status >= 500 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
      continue
    }
    if (res.status === 401 || res.status === 403) {
      throw new KeyExpiredError(res.status, url, 'Riot rejected the API key — it has probably expired.')
    }
    throw new RiotError(res.status, url, `Riot returned ${res.status} for ${path}`)
  }
}

const platformHost = () => `${config.platform}.api.riotgames.com`
const regionHost = () => `${config.region}.api.riotgames.com`

export type Account = { puuid: string; gameName: string; tagLine: string }

export function getAccount(gameName: string, tagLine: string) {
  return call<Account>(
    regionHost(),
    `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
  )
}

export type LeagueEntry = {
  queueType: string
  tier: string
  rank: string
  leaguePoints: number
  wins: number
  losses: number
}

/**
 * Riot moved ranked lookups from summoner id to puuid. Older keys and regions
 * may still only answer the summoner-id route, so fall back to it.
 */
export async function getRankedEntries(puuid: string): Promise<LeagueEntry[]> {
  try {
    return await call<LeagueEntry[]>(platformHost(), `/lol/league/v4/entries/by-puuid/${puuid}`)
  } catch (err) {
    if (err instanceof KeyExpiredError) throw err
    if (!(err instanceof RiotError) || err.status !== 404) throw err
    const summoner = await call<{ id: string }>(platformHost(), `/lol/summoner/v4/summoners/by-puuid/${puuid}`)
    return call<LeagueEntry[]>(platformHost(), `/lol/league/v4/entries/by-summoner/${summoner.id}`)
  }
}

/**
 * `startTime` is epoch seconds, not milliseconds — Riot rejects the request
 * outright if it is given the millisecond value.
 */
export function getMatchIds(puuid: string, count = 20, startTime?: number) {
  const window = startTime ? `&startTime=${Math.floor(startTime / 1000)}` : ''
  return call<string[]>(
    regionHost(),
    `/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${count}${window}`,
  )
}

export type Match = {
  metadata: { matchId: string }
  info: {
    gameCreation: number
    gameEndTimestamp?: number
    queueId: number
    participants: {
      puuid: string
      championName: string
      teamPosition: string
      win: boolean
      kills: number
      deaths: number
      assists: number
    }[]
  }
}

export function getMatch(matchId: string) {
  return call<Match>(regionHost(), `/lol/match/v5/matches/${matchId}`)
}

/** Confirms a key works before we save it. */
export async function keyLooksValid(key: string): Promise<boolean> {
  const res = await fetch(
    `https://${regionHost()}/riot/account/v1/accounts/by-riot-id/Faker/KR1`,
    { headers: { 'X-Riot-Token': key.trim() } },
  )
  return res.status !== 401 && res.status !== 403
}
