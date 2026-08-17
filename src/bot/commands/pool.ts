import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalSubmitInteraction,
} from 'discord.js'
import { POSITIONS } from '../config.js'
import { pools } from '../db.js'
import { championIcon, parseChampionList, searchChampions } from '../ddragon.js'
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
        .setName('edit')
        .setDescription('Fill in your whole pool at once — all five roles in one box')
        .addUserOption((o) => o.setName('user').setDescription('Edit someone else (staff only)')),
    )
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('Add a champion to your pool')
        .addStringOption((o) => o.setName('position').setDescription('Which role').setRequired(true).addChoices(...positionChoices))
        .addStringOption((o) =>
          o.setName('champion').setDescription('One champion, or several separated by commas').setRequired(true).setAutocomplete(true),
        )
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
    // Complete only what is being typed after the last comma, so a list keeps growing.
    const cut = typed.lastIndexOf(',')
    const prefix = cut === -1 ? '' : typed.slice(0, cut + 1) + ' '
    const tail = cut === -1 ? typed : typed.slice(cut + 1).trim()

    await i.respond(
      searchChampions(tail)
        .map((c) => ({ name: `${prefix}${c.name}`.slice(0, 100), value: `${prefix}${c.name}`.slice(0, 100) }))
        .slice(0, 25),
    )
  },

  async execute(i) {
    const sub = i.options.getSubcommand()

    if (sub === 'gaps') return showGaps(i)
    if (sub === 'view') return showPool(i)
    if (sub === 'edit') return openEditor(i)

    const target = i.options.getUser('user')
    if (target && target.id !== i.user.id && !isStaff(i.member as never)) {
      await i.reply({ content: 'Only staff can edit someone else’s pool.', flags: MessageFlags.Ephemeral })
      return
    }
    const who = target ?? i.user
    const position = i.options.getString('position', true)
    const { found, unknown } = parseChampionList(i.options.getString('champion', true))

    if (!found.length) {
      await i.reply({
        content: `I do not recognise ${unknown.map((u) => `**${u}**`).join(', ') || 'that'}. Pick from the suggestions as you type.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    const changed: string[] = []
    const skipped: string[] = []
    for (const champ of found) {
      const result = sub === 'add'
        ? pools.add(who.id, position, champ.name)
        : pools.remove(who.id, position, champ.name)
      ;(result.changes ? changed : skipped).push(champ.name)
    }

    const whose = who.id === i.user.id ? 'your' : `${who}’s`
    const parts: string[] = []
    if (changed.length) {
      parts.push(
        sub === 'add'
          ? `Added **${changed.join('**, **')}** to ${whose} **${position}** pool.`
          : `Removed **${changed.join('**, **')}** from **${position}**.`,
      )
    }
    if (skipped.length) {
      parts.push(sub === 'add' ? `Already there: ${skipped.join(', ')}.` : `Not in the pool: ${skipped.join(', ')}.`)
    }
    if (unknown.length) parts.push(`Did not recognise: ${unknown.join(', ')}.`)

    await i.reply({ content: parts.join('\n'), flags: MessageFlags.Ephemeral })
  },
}

export const POOL_MODAL = 'pool-edit'

async function openEditor(i: Parameters<Command['execute']>[0]) {
  const target = i.options.getUser('user')
  if (target && target.id !== i.user.id && !isStaff(i.member as never)) {
    await i.reply({ content: 'Only staff can edit someone else’s pool.', flags: MessageFlags.Ephemeral })
    return
  }
  const who = target ?? i.user
  const current = pools.forPlayer(who.id)

  const modal = new ModalBuilder()
    .setCustomId(`${POOL_MODAL}:${who.id}`)
    .setTitle(who.id === i.user.id ? 'Your champion pool' : `${who.displayName}’s pool`)

  for (const position of POSITIONS) {
    const existing = current.filter((r) => r.position === position).map((r) => r.champion).join(', ')
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(`pool-${position}`)
          .setLabel(position)
          .setPlaceholder('Ahri, Syndra, Orianna — or leave blank')
          .setStyle(TextInputStyle.Short)
          .setValue(existing.slice(0, 4000))
          .setRequired(false),
      ),
    )
  }

  await i.showModal(modal)
}

/** Applies the modal: whatever is in each box becomes that role's pool. */
export async function handlePoolModal(i: ModalSubmitInteraction) {
  await i.deferReply({ flags: MessageFlags.Ephemeral })

  const targetId = i.customId.split(':')[1] ?? i.user.id
  const lines: string[] = []
  const unknownAll: string[] = []

  for (const position of POSITIONS) {
    const raw = i.fields.getTextInputValue(`pool-${position}`)
    const { found, unknown } = parseChampionList(raw)
    unknownAll.push(...unknown)

    const { added, removed } = pools.replace(targetId, position, found.map((c) => c.name))
    if (!added.length && !removed.length) continue

    const bits: string[] = []
    if (added.length) bits.push(`+ ${added.join(', ')}`)
    if (removed.length) bits.push(`− ${removed.join(', ')}`)
    lines.push(`**${position}** ${bits.join('  ')}`)
  }

  if (!lines.length && !unknownAll.length) {
    await i.editReply('Nothing changed.')
    return
  }

  const parts = [lines.length ? lines.join('\n') : 'Nothing changed.']
  if (unknownAll.length) parts.push(`\nDid not recognise: ${unknownAll.join(', ')}`)
  await i.editReply(parts.join('\n'))
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
