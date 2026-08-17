/**
 * Pulls a player's current standing from Riot into the database.
 *
 * Both the background poll and the /profile command go through here, so a
 * freshly registered player sees real numbers straight away instead of waiting
 * up to half an hour for the next poll.
 */

import type { Guild } from 'discord.js'
import { QUEUE, TIER_ROLE, type Tier } from './config.js'
import { matches, players, ranks, type MatchRow, type Player } from './db.js'
import { getMatch, getMatchIds, getRankedEntries } from './riot.js'
import { rankScore } from './format.js'

export type RankChange = {
  player: Player
  queue: 'solo' | 'flex'
  before: { tier: string | null; division: string | null; lp: number } | undefined
  after: { tier: string | null; division: string | null; lp: number }
  direction: 'up' | 'down'
}

export type SyncResult = {
  changes: RankChange[]
  newGames: number
}

const QUEUE_KEY: Record<string, 'solo' | 'flex'> = {
  [QUEUE.solo]: 'solo',
  [QUEUE.flex]: 'flex',
}

export async function syncPlayer(player: Player, matchCount = 10): Promise<SyncResult> {
  const changes: RankChange[] = []

  const entries = await getRankedEntries(player.puuid)
  for (const entry of entries) {
    const key = QUEUE_KEY[entry.queueType]
    if (!key) continue

    const before = ranks.get(player.puuid, entry.queueType)
    const after = { tier: entry.tier, division: entry.rank, lp: entry.leaguePoints }

    ranks.save({
      puuid: player.puuid,
      queue: entry.queueType,
      tier: entry.tier,
      division: entry.rank,
      lp: entry.leaguePoints,
      wins: entry.wins,
      losses: entry.losses,
    })

    // Only a tier or division move is worth announcing. LP alone is noise.
    const movedTier = before?.tier !== after.tier || before?.division !== after.division
    if (before && movedTier) {
      changes.push({
        player,
        queue: key,
        before,
        after,
        direction: rankScore(after) > rankScore(before) ? 'up' : 'down',
      })
    }
  }

  const ids = await getMatchIds(player.puuid, matchCount)
  const known = matches.known(player.puuid, ids)
  const fresh = ids.filter((id) => !known.has(id))

  const rows: MatchRow[] = []
  for (const id of fresh) {
    const match = await getMatch(id)
    const me = match.info.participants.find((p) => p.puuid === player.puuid)
    if (!me) continue
    rows.push({
      match_id: id,
      puuid: player.puuid,
      champion: me.championName,
      position: me.teamPosition || null,
      win: me.win ? 1 : 0,
      kills: me.kills,
      deaths: me.deaths,
      assists: me.assists,
      queue_id: match.info.queueId,
      played_at: match.info.gameEndTimestamp ?? match.info.gameCreation,
    })
  }

  return { changes, newGames: matches.insertMany(rows) }
}

export async function syncAll(matchCount = 10): Promise<SyncResult> {
  const all: RankChange[] = []
  let newGames = 0
  for (const player of players.all()) {
    const result = await syncPlayer(player, matchCount)
    all.push(...result.changes)
    newGames += result.newGames
  }
  return { changes: all, newGames }
}

/**
 * Gives each registered player the Discord role matching their solo queue
 * tier, and takes away the one they have outgrown.
 */
export async function syncRankRoles(guild: Guild) {
  const tierRoleNames = new Set(Object.values(TIER_ROLE))
  await guild.members.fetch()

  for (const player of players.all()) {
    const member = guild.members.cache.get(player.discord_id)
    if (!member) continue

    const solo = ranks.get(player.puuid, QUEUE.solo)
    const wanted = solo?.tier ? TIER_ROLE[solo.tier as Tier] : undefined

    for (const role of member.roles.cache.values()) {
      if (tierRoleNames.has(role.name) && role.name !== wanted) {
        await member.roles.remove(role, 'Rank changed').catch(() => {})
      }
    }
    if (wanted && !member.roles.cache.some((r) => r.name === wanted)) {
      const role = guild.roles.cache.find((r) => r.name === wanted)
      if (role) await member.roles.add(role, 'Rank updated').catch(() => {})
    }
  }
}
