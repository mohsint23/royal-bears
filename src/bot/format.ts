/**
 * Shared look and feel. Every embed the bot sends goes through here so the
 * server reads as one thing rather than a pile of different-looking messages.
 */

import { EmbedBuilder } from 'discord.js'
import { config, QUEUE_ID, type Tier } from './config.js'
import type { MatchRow, RankRow } from './db.js'

export const BRAND = 0x2b5fd9
export const GOLD = 0xe6b422
export const GREEN = 0x22a45d
export const RED = 0xc8382f
export const GREY = 0x9aa0a6

const TIER_ORDER: Record<string, number> = {
  IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4,
  EMERALD: 5, DIAMOND: 6, MASTER: 7, GRANDMASTER: 8, CHALLENGER: 9,
}
const DIVISION_ORDER: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 }

/** A single number so two ranks can be compared for promotions and demotions. */
export function rankScore(r: Pick<RankRow, 'tier' | 'division' | 'lp'> | undefined): number {
  if (!r?.tier) return -1
  const tier = TIER_ORDER[r.tier] ?? 0
  const div = DIVISION_ORDER[r.division ?? 'IV'] ?? 0
  return tier * 1000 + div * 100 + Math.min(r.lp, 99)
}

const TITLE_CASE = (s: string) => s.charAt(0) + s.slice(1).toLowerCase()

export function rankLabel(r: Pick<RankRow, 'tier' | 'division' | 'lp'> | undefined): string {
  if (!r?.tier) return 'Unranked'
  const apex = r.tier === 'MASTER' || r.tier === 'GRANDMASTER' || r.tier === 'CHALLENGER'
  const name = TITLE_CASE(r.tier)
  return apex ? `${name} ${r.lp} LP` : `${name} ${r.division} · ${r.lp} LP`
}

/** Tier and division only. Flex LP is noise next to solo queue. */
export function rankShort(r: Pick<RankRow, 'tier' | 'division'> | undefined): string {
  if (!r?.tier) return 'Unranked'
  const apex = r.tier === 'MASTER' || r.tier === 'GRANDMASTER' || r.tier === 'CHALLENGER'
  return apex ? TITLE_CASE(r.tier) : `${TITLE_CASE(r.tier)} ${r.division}`
}

export function tierColour(tier: string | null | undefined): number {
  switch (tier) {
    case 'CHALLENGER': return 0xf0d078
    case 'GRANDMASTER': return 0xc8382f
    case 'MASTER': return 0x9b4dca
    case 'DIAMOND': return 0x576bce
    case 'EMERALD': return 0x22a45d
    case 'PLATINUM': return 0x4ea69b
    case 'GOLD': return 0xe0a930
    case 'SILVER': return 0x9fb0c0
    case 'BRONZE': return 0x8c5230
    case 'IRON': return 0x6b5a4e
    default: return GREY
  }
}

export function winrate(wins: number, losses: number): string {
  const total = wins + losses
  if (!total) return '—'
  return `${Math.round((wins / total) * 100)}% (${wins}W ${losses}L)`
}

/** Just the percentage, for places where the W/L breakdown would crowd. */
export function winratePct(wins: number, losses: number): string {
  const total = wins + losses
  return total ? `${Math.round((wins / total) * 100)}%` : '—'
}

/** Pads a row into fixed columns. Only meaningful inside a code block. */
export function columns(rows: string[][], widths: number[]): string {
  return rows
    .map((row) =>
      row
        .map((cell, i) => {
          const width = widths[i]!
          return width < 0 ? cell.padStart(-width) : cell.slice(0, width).padEnd(width)
        })
        .join(' ')
        .trimEnd(),
    )
    .join('\n')
}

export function kda(m: Pick<MatchRow, 'kills' | 'deaths' | 'assists'>): string {
  const ratio = m.deaths === 0 ? m.kills + m.assists : (m.kills + m.assists) / m.deaths
  return `${m.kills}/${m.deaths}/${m.assists} (${ratio.toFixed(1)})`
}

export function queueName(id: number): string {
  return QUEUE_ID[id] ?? 'Other'
}

export function opggLink(gameName: string, tagLine: string): string {
  return `https://op.gg/summoners/${config.opggRegion}/${encodeURIComponent(`${gameName}-${tagLine}`)}`
}

export function opggMultiLink(riotIds: { game_name: string; tag_line: string }[]): string {
  const names = riotIds.map((p) => `${p.game_name}#${p.tag_line}`).join(',')
  return `https://op.gg/multisearch/${config.opggRegion}?summoners=${encodeURIComponent(names)}`
}

/** Counts champions across a set of games, most played first. */
export function topChampions(games: MatchRow[], limit = 3) {
  const tally = new Map<string, { games: number; wins: number }>()
  for (const g of games) {
    const entry = tally.get(g.champion) ?? { games: 0, wins: 0 }
    entry.games++
    entry.wins += g.win
    tally.set(g.champion, entry)
  }
  return [...tally.entries()]
    .map(([champion, v]) => ({ champion, ...v }))
    .sort((a, b) => b.games - a.games || b.wins - a.wins)
    .slice(0, limit)
}

/**
 * The last few games as coloured squares with the record beside them. Shared so
 * /profile and /team cannot drift apart on what recent form looks like.
 */
export function formSquares(games: MatchRow[], limit = 5): string {
  const last = games.slice(0, limit)
  if (!last.length) return 'No games tracked yet'
  const wins = last.filter((m) => m.win).length
  return `${last.map((m) => (m.win ? '🟢' : '🔴')).join('')} ${wins}W ${last.length - wins}L`
}

export function baseEmbed(): EmbedBuilder {
  return new EmbedBuilder().setColor(BRAND).setFooter({ text: 'Royal Bears' }).setTimestamp()
}

/** Pads text into fixed-width columns so lists line up in Discord's font. */
export function table(rows: string[][], widths: number[]): string {
  return rows
    .map((row) => row.map((cell, i) => cell.slice(0, widths[i]).padEnd(widths[i]!)).join(' '))
    .join('\n')
}

export const TIER_NAMES: Record<Tier, string> = {
  IRON: 'Iron', BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold',
  PLATINUM: 'Platinum', EMERALD: 'Emerald', DIAMOND: 'Diamond',
  MASTER: 'Master', GRANDMASTER: 'Grandmaster', CHALLENGER: 'Challenger',
}
