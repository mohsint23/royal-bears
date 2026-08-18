/**
 * Champions a captain wants a player getting ranked games on.
 *
 * Progress is measured from the moment it was assigned, so setting a target
 * does not credit someone for games they played last month.
 */

import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js'
import { champLine, champProgress } from '../champs.js'
import { champTargets } from '../db.js'
import { championDisplay, championIcon, resolveChampion } from '../ddragon.js'
import { baseEmbed, GOLD } from '../format.js'
import { weekStart } from '../jobs/attendance.js'
import { isTracker } from '../util.js'
import type { Command } from './types.js'

const DENIED = 'That one is for the captains and the officer.'

export const champ: Command = {
  data: new SlashCommandBuilder()
    .setName('champ')
    .setDescription('Champions you want a player picking up in ranked')
    // Hides it from ordinary members; the role check below is what enforces it.
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Ask a player to get games on a champion')
        .addUserOption((o) => o.setName('user').setDescription('Which player').setRequired(true))
        .addStringOption((o) =>
          o.setName('champion').setDescription('Champion name').setRequired(true).setAutocomplete(true),
        )
        .addStringOption((o) => o.setName('note').setDescription('Why, or what to work on')),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Drop a champion target')
        .addUserOption((o) => o.setName('user').setDescription('Which player').setRequired(true))
        .addStringOption((o) =>
          o.setName('champion').setDescription('Which target').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('list')
        .setDescription('Targets and how they are going')
        .addUserOption((o) => o.setName('user').setDescription('One player, or leave off for everyone')),
    ),

  async autocomplete(i) {
    const typed = i.options.getFocused().toLowerCase()
    const sub = i.options.getSubcommand()

    if (sub === 'remove') {
      const target = i.options.get('user')?.value as string | undefined
      const rows = target ? champTargets.forUser(target) : champTargets.all()
      await i.respond(
        rows
          .filter((t) => t.champion.toLowerCase().includes(typed.replace(/[^a-z0-9]/g, '')))
          .slice(0, 25)
          .map((t) => ({ name: championDisplay(t.champion).slice(0, 100), value: t.champion })),
      )
      return
    }

    // Resolve as they type: one exact hit beats a list of near misses.
    const hit = resolveChampion(typed)
    await i.respond(hit ? [{ name: hit.name, value: hit.name }] : [])
  },

  async execute(i) {
    if (!isTracker(i.guild?.members.cache.get(i.user.id) ?? null)) {
      await i.reply({ content: DENIED, flags: MessageFlags.Ephemeral })
      return
    }

    const sub = i.options.getSubcommand()
    if (sub === 'set') return set(i)
    if (sub === 'remove') return remove(i)
    return list(i)
  },
}

async function set(i: Parameters<Command['execute']>[0]) {
  const who = i.options.getUser('user', true)
  const input = i.options.getString('champion', true)
  const note = i.options.getString('note')
  const champion = resolveChampion(input)

  if (!champion) {
    await i.reply({ content: `No champion called **${input}**.`, flags: MessageFlags.Ephemeral })
    return
  }

  champTargets.add({
    discord_id: who.id,
    champion: champion.id,
    assigned_by: i.user.id,
    assigned_at: Date.now(),
    note,
  })

  await i.reply({
    content:
      `**${champion.name}** set for ${who}. Games from now on count toward it — ` +
      'run `/champ list` to see how it is going.' +
      (note ? `\nNote: ${note}` : ''),
    flags: MessageFlags.Ephemeral,
  })
}

async function remove(i: Parameters<Command['execute']>[0]) {
  const who = i.options.getUser('user', true)
  const input = i.options.getString('champion', true)
  const champion = resolveChampion(input)?.id ?? input
  const gone = champTargets.remove(who.id, champion)

  await i.reply({
    content: gone
      ? `Dropped **${championDisplay(champion)}** for ${who}.`
      : `${who} had no **${championDisplay(champion)}** target.`,
    flags: MessageFlags.Ephemeral,
  })
}

async function list(i: Parameters<Command['execute']>[0]) {
  const who = i.options.getUser('user')
  const rows = who ? champTargets.forUser(who.id) : champTargets.all()

  if (!rows.length) {
    await i.reply({
      content: who ? `Nothing set for ${who}.` : 'No champion targets set yet. Use `/champ set`.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const embed = baseEmbed()
    .setColor(GOLD)
    .setTitle(who ? `Champion targets — ${who.displayName}` : 'Champion targets')

  const byPlayer = new Map<string, string[]>()
  const start = weekStart()

  for (const discordId of new Set(rows.map((r) => r.discord_id))) {
    const lines = champProgress(discordId, start).map((p) => {
      const set = `<t:${Math.floor(p.target.assigned_at / 1000)}:R>`
      const line = `${champLine(p)} · set ${set}`
      return p.target.note ? `${line}\n-# ${p.target.note}` : line
    })
    byPlayer.set(discordId, lines)
  }

  const first = resolveChampion(rows[0]!.champion)
  if (first) embed.setThumbnail(championIcon(first.id))

  for (const [discordId, lines] of [...byPlayer].slice(0, 25)) {
    embed.addFields({ name: '​', value: `<@${discordId}>\n${lines.join('\n')}`.slice(0, 1024) })
  }

  // Posted to the channel, unlike set/remove, which stay private confirmations.
  await i.reply({ embeds: [embed] })
}
