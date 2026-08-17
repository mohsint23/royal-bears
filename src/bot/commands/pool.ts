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
        .setDescription('Set your champions for a role, graded S to Can’t play')
        .addStringOption((o) =>
          o.setName('position').setDescription('Which role').setRequired(true).addChoices(...positionChoices),
        )
        .addUserOption((o) => o.setName('user').setDescription('Edit someone else (staff only)')),
    )
    .addSubcommand((s) =>
      s
        .setName('view')
        .setDescription("Show a player's pool")
        .addUserOption((o) =>
          o.setName('user').setDescription('Which player — pick yourself for your own').setRequired(true),
        ),
    ),

  async execute(i) {
    const sub = i.options.getSubcommand()
    if (sub === 'edit') return openEditor(i)
    return showPool(i)
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
          .setCustomId(`tier-${tier.id}`)
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
    const parsed = parseChampionList(i.fields.getTextInputValue(`tier-${tier.id}`))
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

const FIELD_LIMIT = 1024

/** Trims a tier line at a champion boundary rather than mid-name. */
function clamp(line: string, budget: number): string {
  if (line.length <= budget) return line
  const cut = line.lastIndexOf(', ', budget - 2)
  return `${line.slice(0, cut > 0 ? cut : budget - 2)} …`
}

/**
 * One line per tier that has anything in it, kept inside Discord's 1024
 * character field limit — a pool big enough to overflow would otherwise make
 * Discord reject the whole message.
 */
function describe(rows: PoolRow[]): string {
  const lines: string[] = []
  let used = 0

  for (const tier of CONFIDENCE) {
    const champs = rows.filter((r) => r.confidence === tier.key).map((r) => r.champion)
    if (!champs.length) continue

    const line = `${tier.mark} **${tier.short}** ${champs.join(', ')}`
    const budget = FIELD_LIMIT - used - 1
    if (budget < 20) break

    const trimmed = clamp(line, budget)
    lines.push(trimmed)
    used += trimmed.length + 1
  }
  return lines.join('\n')
}

async function showPool(i: Parameters<Command['execute']>[0]) {
  const who = i.options.getUser('user', true)
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

  const playable = rows.filter((r) => r.confidence !== "Can't play")
  const roles = POSITIONS.filter((p) => rows.some((r) => r.position === p))
  const topPicks = rows.filter((r) => r.confidence === 'S')

  const embed = baseEmbed()
    .setAuthor({ name: `${who.displayName} — champion pool`, iconURL: who.displayAvatarURL() })
    .setDescription(
      `**${playable.length}** champion${playable.length === 1 ? '' : 's'} across ` +
        `**${roles.length}** role${roles.length === 1 ? '' : 's'}` +
        (topPicks.length ? ` · **${topPicks.length}** at S` : ''),
    )
    // The legend lives down here in small grey text instead of eating the body.
    .setFooter({ text: 'S blind pick · A strong · B playable · ○ learning · ● will not play' })

  for (const position of roles) {
    const forPosition = rows.filter((r) => r.position === position)
    embed.addFields({ name: position.toUpperCase(), value: describe(forPosition) })
  }

  const best = topPicks[0] ?? playable[0] ?? rows[0]
  if (best) embed.setThumbnail(championIcon(best.champion))
  await i.reply({ embeds: [embed] })
}

export { CONFIDENCE_KEYS, type Confidence }
