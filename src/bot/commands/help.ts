import { MessageFlags, SlashCommandBuilder } from 'discord.js'
import { helpEmbed } from '../help.js'
import type { Command } from './types.js'

export const help: Command = {
  data: new SlashCommandBuilder().setName('help').setDescription('What the bot can do'),

  async execute(i) {
    await i.reply({ embeds: [helpEmbed()], flags: MessageFlags.Ephemeral })
  },
}
