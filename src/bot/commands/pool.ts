import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalSubmitInteraction,
} from 'discord.js'
import { CONFIDENCE, CONFIDENCE_KEYS, POSITIONS, type Confidence } from '../config.js'
import { pools, type PoolRow } from '../db.js'
import { championIcon, parseChampionList } from '../ddragon.js'
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
        .setDescription('Set your champions for a role, sorted by how confident you are')
        .addStringOption((o) =>
          o.setName('position').setDescription('Which role').setRequired(true).addChoices(...positionChoices),
        )
        .addUserOption((o) => o.setName('user').setDescription('Edit someone else (staff only)')),
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

  async execute(i) {
    const sub = i.options.getSubcommand()
    if (sub === 'edit') return openEditor(i)
    if (sub === 'view') return showPool(i)
    return showGaps(i)
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
  const position = i.options.getString('position', true)
  const current = pools.forPlayer(who.id).filter((r) => r.position === position)

  const modal = new ModalBuilder()
    .setCustomId(`${POOL_MODAL}:${who.id}:${position}`)
    .setTitle(`${position} — ${who.id === i.user.id ? 'your pool' : who.displayName}`)

  for (const tier of CONFIDENCE) {
    const existing = current
      .filter((r) => r.confidence === tier.key)
      .map((r) => r.champion)
      .join(', ')

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(`tier-${tier.key}`)
          .setLabel(`${tier.key} — ${tier.hint}`.slice(0, 45))
          .setPlaceholder('Ahri, Syndra, Orianna — or leave blank')
          .setStyle(TextInputStyle.Short)
          .setValue(existing.slice(0, 4000))
          .setRequired(false),
      ),
    )
  }

  await i.showModal(modal)
}

/** Whatever is in the three boxes becomes that role's pool. */
export async function handlePoolModal(i: ModalSubmitInteraction) {
  await i.deferReply({ flags: MessageFlags.Ephemeral })

  const [, targetId = i.user.id, position = POSITIONS[0]] = i.customId.split(':')
  const entries: { champion: string; confidence: string }[] = []
  const unknown: string[] = []
  const claimed = new Set<string>()

  // Best tier wins if the same champion is typed into two boxes.
  for (const tier of CONFIDENCE) {
    const parsed = parseChampionList(i.fields.getTextInputValue(`tier-${tier.key}`))
    unknown.push(...parsed.unknown)
    for (const champ of parsed.found) {
      if (claimed.has(champ.name)) continue
      claimed.add(champ.name)
      entries.push({ champion: champ.name, confidence: tier.key })
    }
  }

  const { added, removed, moved } = pools.replace(targetId, position, entries)

  const lines: string[] = []
  if (added.length) lines.push(`**Added** ${added.join(', ')}`)
  if (removed.length) lines.push(`**Removed** ${removed.join(', ')}`)
  for (const m of moved) lines.push(`**${m.champion}** moved ${m.from} → ${m.to}`)
  if (unknown.length) lines.push(`\n*Did not recognise: ${unknown.join(', ')}*`)

  await i.editReply(lines.length ? `**${position}**\n${lines.join('\n')}` : 'Nothing changed.')
}

const MARK: Record<string, string> = { Comfort: '🟢', Confident: '🔵', Learning: '🟡' }

function describe(rows: PoolRow[]): string {
  return CONFIDENCE.map((tier) => {
    const champs = rows.filter((r) => r.confidence === tier.key).map((r) => r.champion)
    return champs.length ? `${MARK[tier.key]} **${tier.key}** — ${champs.join(', ')}` : null
  })
    .filter(Boolean)
    .join('\n')
}

async function showPool(i: Parameters<Command['execute']>[0]) {
  const who = i.options.getUser('user') ?? i.user
  const rows = pools.forPlayer(who.id)

  if (!rows.length) {
    await i.reply({
      content:
        who.id === i.user.id
          ? 'Your pool is empty. Fill it in with `/pool edit position:Mid`.'
          : `${who} has not set a pool yet.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const embed = baseEmbed()
    .setTitle(`${who.displayName}’s champion pool`)
    .setDescription(CONFIDENCE.map((t) => `${MARK[t.key]} ${t.key} — *${t.hint}*`).join('\n'))

  for (const position of POSITIONS) {
    const forPosition = rows.filter((r) => r.position === position)
    if (forPosition.length) embed.addFields({ name: position, value: describe(forPosition) })
  }

  const best = rows.find((r) => r.confidence === 'Comfort') ?? rows[0]
  if (best) embed.setThumbnail(championIcon(best.champion))
  await i.reply({ embeds: [embed] })
}

async function showGaps(i: Parameters<Command['execute']>[0]) {
  if (!i.guild) return
  await i.deferReply()

  const key = i.options.getString('team', true) as TeamKey
  const roster = await rosterMembers(i.guild, key)
  const rows = pools.forPlayers(roster.map((m) => m.id))

  const embed = baseEmbed()
    .setTitle(`${key === 'a' ? 'A Team' : 'B Team'} — pool coverage`)
    .setDescription('Judged on Comfort picks, since those are the ones you can actually draft.')

  for (const position of POSITIONS) {
    const forPosition = rows.filter((r) => r.position === position)
    const comfort = new Set(forPosition.filter((r) => r.confidence === 'Comfort').map((r) => r.champion))
    const players = new Set(forPosition.map((r) => r.discord_id)).size

    const verdict = players === 0 ? '⚠️ nobody' : comfort.size === 0 ? '⚠️ no comfort picks' : comfort.size < 3 ? '⚠️ thin' : '✅'
    embed.addFields({
      name: position,
      value: `${verdict}\n${players} player${players === 1 ? '' : 's'} · ${comfort.size} comfort pick${comfort.size === 1 ? '' : 's'}`,
      inline: true,
    })
  }

  const noPool = roster.filter((m) => !rows.some((r) => r.discord_id === m.id))
  if (noPool.length) embed.addFields({ name: 'No pool set', value: noPool.map((m) => m.displayName).join(', ') })

  await i.editReply({ embeds: [embed] })
}

export { CONFIDENCE_KEYS, type Confidence }
