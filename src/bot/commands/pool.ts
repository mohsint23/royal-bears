import {
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { POSITIONS } from '../config.js'
import { pools } from '../db.js'
import { championIcon, resolveChampion, searchChampions } from '../ddragon.js'
import { baseEmbed } from '../format.js'
import { isStaff, rosterMembers, type TeamKey } from '../util.js'
import type { Command } from './types.js'

const positionChoices = POSITIONS.map((p) => ({ name: p, value: p }))

export const pool: Command = {
  data: new SlashCommandBuilder()
    .setName('pool')
    .setDescription('Champion pools for the team')
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Add a champion to your pool')
        .addStringOption((o) => o.setName('position').setDescription('Which role').setRequired(true).addChoices(...positionChoices))
        .addStringOption((o) => o.setName('champion').setDescription('Champion name').setRequired(true).setAutocomplete(true))
        .addUserOption((o) => o.setName('user').setDescription('Add for someone else (staff only)')),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Take a champion out of your pool')
        .addStringOption((o) => o.setName('position').setDescription('Which role').setRequired(true).addChoices(...positionChoices))
        .addStringOption((o) => o.setName('champion').setDescription('Champion name').setRequired(true).setAutocomplete(true))
        .addUserOption((o) => o.setName('user').setDescription('Remove for someone else (staff only)')),
    )
    .addSubcommand((s) =>
      s
        .setName('view')
        .setDescription("Show a player's pool")
        .addUserOption((o) => o.setName('user').setDescription('Whose pool (defaults to you)')),
    )
    .addSubcommand((s) =>
      s
        .setName('gaps')
        .setDescription('Where a roster is thin')
        .addStringOption((o) =>
          o.setName('team').setDescription('Which roster').setRequired(true)
            .addChoices({ name: 'A Team', value: 'a' }, { name: 'B Team', value: 'b' }),
        ),
    ),

  async autocomplete(i) {
    const typed = i.options.getFocused()
    await i.respond(searchChampions(typed).map((c) => ({ name: c.name, value: c.name })))
  },

  async execute(i) {
    const sub = i.options.getSubcommand()

    if (sub === 'gaps') return showGaps(i)
    if (sub === 'view') return showPool(i)

    const target = i.options.getUser('user')
    if (target && target.id !== i.user.id && !isStaff(i.member as never)) {
      await i.reply({ content: 'Only staff can edit someone else’s pool.', flags: MessageFlags.Ephemeral })
      return
    }
    const who = target ?? i.user
    const position = i.options.getString('position', true)
    const champ = resolveChampion(i.options.getString('champion', true))

    if (!champ) {
      await i.reply({ content: 'I do not recognise that champion. Pick one from the suggestions.', flags: MessageFlags.Ephemeral })
      return
    }

    if (sub === 'add') {
      const result = pools.add(who.id, position, champ.name)
      await i.reply({
        content: result.changes
          ? `Added **${champ.name}** to ${who.id === i.user.id ? 'your' : `${who}’s`} **${position}** pool.`
          : `**${champ.name}** is already in that pool.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const result = pools.remove(who.id, position, champ.name)
    await i.reply({
      content: result.changes
        ? `Removed **${champ.name}** from **${position}**.`
        : `**${champ.name}** was not in that pool.`,
      flags: MessageFlags.Ephemeral,
    })
  },
}

async function showPool(i: Parameters<Command['execute']>[0]) {
  const who = i.options.getUser('user') ?? i.user
  const rows = pools.forPlayer(who.id)

  if (!rows.length) {
    await i.reply({
      content:
        who.id === i.user.id
          ? 'Your pool is empty. Add to it with `/pool add`.'
          : `${who} has not set a pool yet.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const embed = baseEmbed().setTitle(`${who.displayName}’s champion pool`)
  for (const position of POSITIONS) {
    const champs = rows.filter((r) => r.position === position).map((r) => r.champion)
    if (champs.length) embed.addFields({ name: position, value: champs.join(', '), inline: true })
  }

  const first = rows[0]
  if (first) embed.setThumbnail(championIcon(first.champion))
  await i.reply({ embeds: [embed] })
}

async function showGaps(i: Parameters<Command['execute']>[0]) {
  if (!i.guild) return
  await i.deferReply()

  const key = i.options.getString('team', true) as TeamKey
  const roster = await rosterMembers(i.guild, key)
  const rows = pools.forPlayers(roster.map((m) => m.id))

  const embed = baseEmbed().setTitle(`${key === 'a' ? 'A Team' : 'B Team'} — pool coverage`)

  for (const position of POSITIONS) {
    const forPosition = rows.filter((r) => r.position === position)
    const playerCount = new Set(forPosition.map((r) => r.discord_id)).size
    const champCount = new Set(forPosition.map((r) => r.champion)).size
    const verdict = playerCount === 0 ? '⚠️ nobody' : champCount < 3 ? '⚠️ thin' : '✅'
    embed.addFields({
      name: position,
      value: `${verdict} · ${playerCount} player${playerCount === 1 ? '' : 's'}, ${champCount} champ${champCount === 1 ? '' : 's'}`,
      inline: true,
    })
  }

  const noPool = roster.filter((m) => !rows.some((r) => r.discord_id === m.id))
  if (noPool.length) {
    embed.addFields({ name: 'No pool set', value: noPool.map((m) => m.displayName).join(', ') })
  }

  await i.editReply({ embeds: [embed] })
}
