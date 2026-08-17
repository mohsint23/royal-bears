/**
 * A Sunday evening roundup in the tracker channel: who played, who climbed,
 * what the team has been picking.
 */

import type { Client, Guild } from 'discord.js'
import { config, QUEUE } from '../config.js'
import { accounts, matches, ranks, settings } from '../db.js'
import { championIcon } from '../ddragon.js'
import { baseEmbed, GOLD, rankLabel, rankScore, topChampions, winrate } from '../format.js'
import { statChannel } from './announce.js'

const LAST_RUN = 'last_weekly'
const WEEK = 7 * 24 * 60 * 60 * 1000

/** Sunday 18:00 UK time, whatever the server's own clock is set to. */
function londonParts(at = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]))
  return {
    weekday: parts.weekday,
    hour: Number(parts.hour),
    date: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

export function shouldRunWeekly(now = new Date()): { run: boolean; date: string } {
  const { weekday, hour, date } = londonParts(now)
  return { run: weekday === 'Sun' && hour >= 18 && settings.get(LAST_RUN) !== date, date }
}

export async function postWeekly(guild: Guild) {
  const channel = await statChannel(guild)
  if (!channel) return

  const since = Date.now() - WEEK

  // A player's week is everything they played, across every account they linked.
  const rows = accounts.userIds().map((discordId) => {
    const linked = accounts.forUser(discordId)
    const games = linked.flatMap((a) => matches.since(a.puuid, since))
    const best = linked
      .map((a) => ranks.get(a.puuid, QUEUE.solo))
      .filter((r): r is NonNullable<typeof r> => Boolean(r?.tier))
      .sort((a, b) => rankScore(b) - rankScore(a))[0]

    return {
      discordId,
      games,
      wins: games.filter((g) => g.win).length,
      solo: best,
      accountCount: linked.length,
    }
  })

  const active = rows.filter((r) => r.games.length).sort((a, b) => b.games.length - a.games.length)

  const embed = baseEmbed().setColor(GOLD).setTitle('This week in Royal Bears')

  if (!active.length) {
    embed.setDescription('Nobody played a tracked game this week. Suspicious.')
    await channel.send({ embeds: [embed] })
    settings.set(LAST_RUN, londonParts().date)
    return
  }

  embed.addFields({
    name: 'Most games',
    value: active
      .slice(0, 5)
      .map(
        (r, idx) =>
          `${idx + 1}. <@${r.discordId}> — ${r.games.length} games, ${winrate(
            r.wins,
            r.games.length - r.wins,
          )}`,
      )
      .join('\n'),
  })

  const grinders = [...active].filter((r) => r.games.length >= 5)
  if (grinders.length) {
    const best = [...grinders].sort(
      (a, b) => b.wins / b.games.length - a.wins / a.games.length,
    )[0]!
    embed.addFields({
      name: 'Best winrate (5+ games)',
      value: `<@${best.discordId}> — ${winrate(best.wins, best.games.length - best.wins)}`,
    })
  }

  const allGames = active.flatMap((r) => r.games)
  const champs = topChampions(allGames, 5)
  if (champs.length) {
    embed.setThumbnail(championIcon(champs[0]!.champion))
    embed.addFields({
      name: 'Team’s most picked',
      value: champs.map((c) => `**${c.champion}** — ${c.games} games`).join('\n'),
    })
  }

  const ranked = active.filter((r) => r.solo?.tier)
  if (ranked.length) {
    embed.addFields({
      name: 'Current ranks',
      value: ranked
        .map((r) => `<@${r.discordId}> — ${rankLabel(r.solo)}`)
        .join('\n')
        .slice(0, 1024),
    })
  }

  await channel.send({ embeds: [embed] })
  settings.set(LAST_RUN, londonParts().date)
}

export function startWeekly(client: Client) {
  const tick = async () => {
    const { run, date } = shouldRunWeekly()
    if (!run) return
    const guild = client.guilds.cache.get(config.guildId)
    if (!guild) return
    settings.set(LAST_RUN, date)
    await postWeekly(guild).catch((err) => console.error('[weekly] failed:', err))
  }
  setInterval(tick, 60_000)
}
