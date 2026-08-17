import { SlashCommandBuilder } from 'discord.js'
import { QUEUE } from '../config.js'
import { matches, players, ranks } from '../db.js'
import { baseEmbed, opggMultiLink, rankLabel, topChampions, winrate } from '../format.js'
import { rosterMembers, type TeamKey } from '../util.js'
import type { Command } from './types.js'

const WEEK = 7 * 24 * 60 * 60 * 1000

export const team: Command = {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('The whole roster at a glance')
    .addStringOption((o) =>
      o
        .setName('team')
        .setDescription('Which roster')
        .setRequired(true)
        .addChoices({ name: 'A Team', value: 'a' }, { name: 'B Team', value: 'b' }),
    ),

  async execute(i) {
    if (!i.guild) return
    await i.deferReply()

    const key = i.options.getString('team', true) as TeamKey
    const roster = await rosterMembers(i.guild, key)

    if (!roster.length) {
      await i.editReply(`Nobody has the **${key === 'a' ? 'A Team' : 'B Team'}** role yet.`)
      return
    }

    const registered: { game_name: string; tag_line: string }[] = []
    const lines: string[] = []
    const missing: string[] = []

    for (const member of roster) {
      const player = players.byDiscordId(member.id)
      if (!player) {
        missing.push(member.displayName)
        continue
      }
      registered.push({ game_name: player.game_name, tag_line: player.tag_line })

      const solo = ranks.get(player.puuid, QUEUE.solo)
      const week = matches.since(player.puuid, Date.now() - WEEK)
      const champs = topChampions(matches.recent(player.puuid, 20), 2)

      lines.push(
        `**${member.displayName}** — ${rankLabel(solo)}\n` +
          ` ${week.length} games this week` +
          (week.length
            ? ` · ${winrate(week.filter((m) => m.win).length, week.filter((m) => !m.win).length)}`
            : '') +
          (champs.length ? `\n ${champs.map((c) => `${c.champion} (${c.games})`).join(', ')}` : ''),
      )
    }

    const embed = baseEmbed()
      .setTitle(key === 'a' ? 'A Team' : 'B Team')
      .setDescription(lines.join('\n\n') || 'Nobody on this roster has registered yet.')

    if (registered.length) {
      embed.addFields({ name: 'Multi-search', value: `[Open all on op.gg](${opggMultiLink(registered)})` })
    }
    if (missing.length) {
      embed.addFields({ name: 'Not registered', value: missing.join(', ') })
    }

    await i.editReply({ embeds: [embed] })
  },
}
