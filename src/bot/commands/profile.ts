import {
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { QUEUE } from '../config.js'
import { matches, players, ranks } from '../db.js'
import { championIcon } from '../ddragon.js'
import { KeyExpiredError } from '../riot.js'
import { syncPlayer } from '../sync.js'
import { baseEmbed, kda, opggLink, queueName, rankLabel, tierColour, topChampions, winrate } from '../format.js'
import type { Command } from './types.js'

const WEEK = 7 * 24 * 60 * 60 * 1000
const STALE = 10 * 60 * 1000

export const profile: Command = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Rank, recent champions and form for a player')
    .addUserOption((o) => o.setName('user').setDescription('Whose profile (defaults to you)')),

  async execute(i) {
    const who = i.options.getUser('user') ?? i.user
    const player = players.byDiscordId(who.id)

    if (!player) {
      await i.reply({
        content:
          who.id === i.user.id
            ? 'You are not registered yet. Run `/register riot-id:YourName#TAG`.'
            : `${who} has not registered a Riot account yet.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await i.deferReply()

    const solo = ranks.get(player.puuid, QUEUE.solo)
    const stale = !solo || Date.now() - solo.updated_at > STALE
    let warning = ''

    if (stale) {
      try {
        await syncPlayer(player)
      } catch (err) {
        warning =
          err instanceof KeyExpiredError
            ? '\n\n*The Riot key has expired, so this may be out of date. Staff can run `/setkey`.*'
            : '\n\n*Could not reach Riot just now, so this may be out of date.*'
      }
    }

    const soloNow = ranks.get(player.puuid, QUEUE.solo)
    const flexNow = ranks.get(player.puuid, QUEUE.flex)
    const recent = matches.recent(player.puuid, 20)
    const thisWeek = matches.since(player.puuid, Date.now() - WEEK)
    const champs = topChampions(recent, 3)

    const embed = baseEmbed()
      .setColor(tierColour(soloNow?.tier))
      .setTitle(`${player.game_name}#${player.tag_line}`)
      .setURL(opggLink(player.game_name, player.tag_line))
      .setDescription(`${who}${warning}`)
      .addFields(
        {
          name: 'Solo queue',
          value: soloNow?.tier
            ? `${rankLabel(soloNow)}\n${winrate(soloNow.wins, soloNow.losses)}`
            : 'Unranked',
          inline: true,
        },
        {
          name: 'Flex',
          value: flexNow?.tier
            ? `${rankLabel(flexNow)}\n${winrate(flexNow.wins, flexNow.losses)}`
            : 'Unranked',
          inline: true,
        },
        {
          name: 'Last 7 days',
          value: thisWeek.length
            ? `${thisWeek.length} games\n${winrate(
                thisWeek.filter((m) => m.win).length,
                thisWeek.filter((m) => !m.win).length,
              )}`
            : 'No games',
          inline: true,
        },
      )

    if (champs.length) {
      embed.setThumbnail(championIcon(champs[0]!.champion))
      embed.addFields({
        name: 'Most played recently',
        value: champs
          .map((c) => `**${c.champion}** — ${c.games} games, ${winrate(c.wins, c.games - c.wins)}`)
          .join('\n'),
      })
    }

    if (recent.length) {
      embed.addFields({
        name: 'Last 5 games',
        value: recent
          .slice(0, 5)
          .map((m) => `${m.win ? '🟢' : '🔴'} **${m.champion}** ${kda(m)} · ${queueName(m.queue_id)}`)
          .join('\n'),
      })
    } else {
      embed.addFields({
        name: 'Last 5 games',
        value: 'Nothing tracked yet. Games appear after the next refresh.',
      })
    }

    await i.editReply({ embeds: [embed] })
  },
}
