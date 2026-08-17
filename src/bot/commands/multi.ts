import { SlashCommandBuilder } from 'discord.js'
import { accounts } from '../db.js'
import { baseEmbed, opggMultiLink } from '../format.js'
import { rosterMembers, type TeamKey } from '../util.js'
import type { Command } from './types.js'

export const multi: Command = {
  data: new SlashCommandBuilder()
    .setName('multi')
    .setDescription('One op.gg link with the whole roster on it')
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
    const registered = roster
      .map((m) => accounts.mainFor(m.id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p))

    if (!registered.length) {
      await i.editReply(`Nobody on **${key === 'a' ? 'A Team' : 'B Team'}** has registered a Riot account yet.`)
      return
    }

    await i.editReply({
      embeds: [
        baseEmbed()
          .setTitle(`${key === 'a' ? 'A Team' : 'B Team'} multi-search`)
          .setURL(opggMultiLink(registered))
          .setDescription(
            `${registered.map((p) => `${p.game_name}#${p.tag_line}`).join('\n')}\n\n` +
              `[Open all ${registered.length} on op.gg](${opggMultiLink(registered)})`,
          ),
      ],
    })
  },
}
