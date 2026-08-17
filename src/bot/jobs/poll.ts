/**
 * The background loop: pull everyone's games from Riot, announce rank changes,
 * and keep the rank roles honest.
 *
 * Riot development keys die every 24 hours. When that happens the loop stops
 * hammering a dead key, says so once in the tracker channel, and waits for
 * someone to run /setkey.
 */

import type { Client, Guild } from 'discord.js'
import { config } from '../config.js'
import { players, settings } from '../db.js'
import { hasKey, KeyExpiredError } from '../riot.js'
import { syncAll, syncRankRoles, type RankChange } from '../sync.js'
import { baseEmbed, GREEN, RED, rankLabel, tierColour } from '../format.js'
import { staffMention, statChannel } from './announce.js'

const POLL_EVERY = 30 * 60 * 1000
const KEY_WARNING = 'key_warned_at'
const WARN_EVERY = 6 * 60 * 60 * 1000

export async function runPoll(guild: Guild) {
  if (!players.all().length) return

  if (!hasKey()) {
    await warnAboutKey(guild, 'No Riot API key is set.')
    return
  }

  try {
    const result = await syncAll()
    settings.set(KEY_WARNING, '')

    if (result.changes.length) await announceChanges(guild, result.changes)
    await syncRankRoles(guild)
  } catch (err) {
    if (err instanceof KeyExpiredError) {
      await warnAboutKey(guild, 'The Riot API key has expired.')
      return
    }
    console.error('[poll] failed:', err)
  }
}

async function warnAboutKey(guild: Guild, reason: string) {
  const last = Number(settings.get(KEY_WARNING) || 0)
  if (Date.now() - last < WARN_EVERY) return
  settings.set(KEY_WARNING, String(Date.now()))

  const channel = await statChannel(guild)
  if (!channel) return

  await channel.send({
    content: staffMention(guild),
    embeds: [
      baseEmbed()
        .setColor(RED)
        .setTitle('Tracking paused')
        .setDescription(`${reason}\n\nRun \`/setkey\` with a fresh key from the Riot developer portal to resume.`),
    ],
  })
}

async function announceChanges(guild: Guild, changes: RankChange[]) {
  const channel = await statChannel(guild)
  if (!channel) return

  for (const change of changes) {
    const up = change.direction === 'up'
    await channel.send({
      embeds: [
        baseEmbed()
          .setColor(up ? GREEN : tierColour(change.after.tier))
          .setTitle(up ? 'Rank up' : 'Rank down')
          .setDescription(
            `<@${change.player.discord_id}> — **${change.player.game_name}#${change.player.tag_line}**\n` +
              `${rankLabel(change.before)} → **${rankLabel(change.after)}**` +
              `\n*${change.queue === 'solo' ? 'Solo queue' : 'Flex'}*`,
          ),
      ],
    })
  }
}

export function startPolling(client: Client) {
  const tick = async () => {
    const guild = client.guilds.cache.get(config.guildId)
    if (!guild) return
    await runPoll(guild).catch((err) => console.error('[poll] unhandled:', err))
  }
  setTimeout(tick, 30_000)
  setInterval(tick, POLL_EVERY)
}
