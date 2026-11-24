import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js'
import { GAMES, gameByKey, gameRole } from '../games.js'
import type { Command } from './types.js'

const MAX_NOTE = 200

/**
 * Pings a game role for people who hold it (or admins). The roles themselves
 * are not mentionable, so this is the only way to ping them; the bot sends the
 * message, which it may do because it has Administrator.
 */
export const ping: Command = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Ping everyone with a game role. Only people who have that role can use it')
    .addStringOption((o) =>
      o
        .setName('game')
        .setDescription('Which game')
        .setRequired(true)
        .addChoices(...GAMES.map((g) => ({ name: `${g.emoji} ${g.role}`, value: g.key }))),
    )
    .addStringOption((o) =>
      o.setName('message').setDescription('Optional, e.g. "need 2 for a 5-stack"').setMaxLength(MAX_NOTE),
    ),

  async execute(i) {
    const game = gameByKey(i.options.getString('game', true))
    if (!i.guild || !game || !i.channel?.isSendable()) {
      await i.reply({ content: 'That only works in a server channel.', flags: MessageFlags.Ephemeral })
      return
    }
    const member = await i.guild.members.fetch(i.user.id)
    const role = gameRole(i.guild, game)
    if (!role) {
      await i.reply({ content: `There's no **${game.role}** role on the server.`, flags: MessageFlags.Ephemeral })
      return
    }

    const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator)
    if (!isAdmin && !member.roles.cache.has(role.id)) {
      await i.reply({
        content: `Only people with **${game.role}** can ping it. Grab the role in #get-roles first.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }
    // The bot can post anywhere; the person asking should only ping where they could post themselves.
    if (!('permissionsFor' in i.channel) || !i.channel.permissionsFor(member)?.has(PermissionFlagsBits.SendMessages)) {
      await i.reply({ content: "You can't post in this channel, so you can't ping from it either.", flags: MessageFlags.Ephemeral })
      return
    }

    const note = i.options.getString('message')?.trim()
    await i.reply({ content: 'Sent.', flags: MessageFlags.Ephemeral })
    await i.channel.send({
      content: `${game.emoji} ${role} · ${member} wants a game${note ? `: ${note}` : '.'}`,
      allowedMentions: { roles: [role.id], users: [] },
    })
  },
}
