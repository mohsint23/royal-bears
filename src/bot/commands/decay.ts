/**
 * The decay check, on demand: every Diamond+ account's bank, lowest first.
 * Lists people without pinging them; the morning post is what pings.
 */

import { SlashCommandBuilder } from 'discord.js'
import { buildDecay, collectDecay } from '../jobs/decay.js'
import type { Command } from './types.js'

export const decay: Command = {
  data: new SlashCommandBuilder()
    .setName('decay')
    .setDescription('How many days of decay each Diamond+ account has banked')
    .addBooleanOption((o) =>
      o
        .setName('refresh')
        .setDescription('Pull fresh games from Riot first — slower, but exact'),
    ),

  async execute(i) {
    await i.deferReply()
    const { entries, warning } = await collectDecay(Boolean(i.options.getBoolean('refresh')))
    const { embed } = buildDecay(entries, { onlyAtRisk: false, warning })
    await i.editReply({ embeds: [embed], allowedMentions: { parse: [] } })
  },
}
