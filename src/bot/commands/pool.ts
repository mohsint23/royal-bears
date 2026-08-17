import {
  ActionRowBuilder,
  AttachmentBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ModalSubmitInteraction,
} from 'discord.js'
import { CONFIDENCE, CONFIDENCE_KEYS, POSITIONS, type Confidence } from '../config.js'
import { poolImages, pools, WHOLE_POOL, type PoolRow } from '../db.js'
import { championIcon, parseChampionList } from '../ddragon.js'
import { baseEmbed } from '../format.js'
import { pathFor, removeImage, saveImage } from '../images.js'
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
        .setName('upload')
        .setDescription('Upload a tier list screenshot instead of typing your pool')
        .addAttachmentOption((o) =>
          o.setName('image').setDescription('Your tier list — PNG, JPG, WEBP or GIF').setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName('position')
            .setDescription('Which role this covers. Leave off if it covers everything')
            .addChoices(...positionChoices),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('unupload')
        .setDescription('Delete an uploaded tier list image')
        .addStringOption((o) =>
          o
            .setName('position')
            .setDescription('Which role. Leave off for the whole-pool image')
            .addChoices(...positionChoices),
        ),
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
    if (sub === 'upload') return upload(i)
    if (sub === 'unupload') return unupload(i)
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

async function upload(i: Parameters<Command['execute']>[0]) {
  const attachment = i.options.getAttachment('image', true)
  const position = i.options.getString('position') ?? WHOLE_POOL

  await i.deferReply({ flags: MessageFlags.Ephemeral })
  const result = await saveImage(i.user.id, position, attachment)

  if (!result.ok) {
    await i.editReply(result.reason)
    return
  }
  await i.editReply(
    `Saved as ${position === WHOLE_POOL ? 'your whole pool' : `your **${position}** pool`}. ` +
      'It shows up in `/pool view` from now on.',
  )
}

async function unupload(i: Parameters<Command['execute']>[0]) {
  const position = i.options.getString('position') ?? WHOLE_POOL
  const removed = removeImage(i.user.id, position)
  await i.reply({
    content: removed
      ? `Deleted the ${position === WHOLE_POOL ? 'whole-pool' : `**${position}**`} image.`
      : 'There was no image saved there.',
    flags: MessageFlags.Ephemeral,
  })
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
  const images = poolImages.forPlayer(who.id)

  if (!rows.length && !images.length) {
    await i.reply({
      content:
        who.id === i.user.id
          ? 'Your pool is empty. Type it in with `/pool edit`, or upload a tier list with `/pool upload`.'
          : `${who} has not set a pool yet.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // An uploaded tier list is a pool on its own — there may be nothing typed.
  if (!rows.length) {
    const header = baseEmbed()
      .setAuthor({ name: `${who.displayName} — champion pool`, iconURL: who.displayAvatarURL() })
      .setDescription('Uploaded tier list.')
    const { embeds, files } = withImages(who.id, header)
    await i.reply({ embeds, files })
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

  const { embeds, files } = withImages(who.id, embed)
  await i.reply({ embeds, files })
}

/**
 * Attaches any uploaded tier lists. Discord allows one image per embed, so a
 * player with several roles covered gets one embed each.
 */
function withImages(discordId: string, first: ReturnType<typeof baseEmbed>) {
  const images = poolImages.forPlayer(discordId)
  const files: AttachmentBuilder[] = []
  const embeds: ReturnType<typeof baseEmbed>[] = [first]

  // The whole-pool image belongs on the main embed; role images follow it.
  const whole = images.find((img) => img.position === WHOLE_POOL)
  const perRole = images.filter((img) => img.position !== WHOLE_POOL)

  if (whole) {
    files.push(new AttachmentBuilder(pathFor(whole.file), { name: whole.file }))
    first.setImage(`attachment://${whole.file}`)
  }
  for (const image of perRole.slice(0, 9)) {
    files.push(new AttachmentBuilder(pathFor(image.file), { name: image.file }))
    embeds.push(baseEmbed().setTitle(image.position).setImage(`attachment://${image.file}`))
  }

  return { embeds, files }
}

export { CONFIDENCE_KEYS, type Confidence }
