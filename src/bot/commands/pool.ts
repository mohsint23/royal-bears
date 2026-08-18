import {
  AttachmentBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { POSITIONS } from '../config.js'
import { poolImages, WHOLE_POOL } from '../db.js'
import { baseEmbed } from '../format.js'
import { pathFor, removeImage, saveImage } from '../images.js'
import { rosterMembers, TEAM_ROLE, type TeamKey } from '../util.js'
import type { Command } from './types.js'

/** Discord allows ten embeds in a message, and the header takes one of them. */
const MAX_PLAYERS = 9

const positionChoices = POSITIONS.map((p) => ({ name: p, value: p }))

export const pool: Command = {
  data: new SlashCommandBuilder()
    .setName('pool')
    .setDescription('Champion pools, as tier list images')
    .addSubcommand((s) =>
      s
        .setName('upload')
        .setDescription('Upload your tier list')
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
        .setName('view')
        .setDescription('Show tier lists — one player, or a whole roster')
        .addUserOption((o) =>
          o.setName('user').setDescription('Which player. Leave both off for your own'),
        )
        .addStringOption((o) =>
          o
            .setName('team')
            .setDescription('A whole roster at once, instead of one player')
            .addChoices({ name: 'A Team', value: 'a' }, { name: 'B Team', value: 'b' }),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Delete one of your tier lists')
        .addStringOption((o) =>
          o
            .setName('position')
            .setDescription('Which role. Leave off for the whole-pool image')
            .addChoices(...positionChoices),
        ),
    ),

  async execute(i) {
    const sub = i.options.getSubcommand()
    if (sub === 'upload') return upload(i)
    if (sub === 'remove') return remove(i)
    return showPool(i)
  },
}

const label = (position: string) => (position === WHOLE_POOL ? 'whole pool' : position)

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
    `Saved as your **${label(position)}** tier list. It shows up in \`/pool view\` from now on.`,
  )
}

async function remove(i: Parameters<Command['execute']>[0]) {
  const position = i.options.getString('position') ?? WHOLE_POOL
  const removed = removeImage(i.user.id, position)
  await i.reply({
    content: removed ? `Deleted your **${label(position)}** tier list.` : 'There was nothing saved there.',
    flags: MessageFlags.Ephemeral,
  })
}

async function showPool(i: Parameters<Command['execute']>[0]) {
  const team = i.options.getString('team') as TeamKey | null
  const chosen = i.options.getUser('user')

  if (team && chosen) {
    await i.reply({
      content: 'Pick one or the other — a player or a team, not both.',
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  if (team) return showTeamPool(i, team)

  // No player and no team means the obvious thing: show me my own.
  const who = chosen ?? i.user
  const images = poolImages.forPlayer(who.id)

  if (!images.length) {
    await i.reply({
      content:
        who.id === i.user.id
          ? 'You have not uploaded a tier list yet. Add one with `/pool upload`.'
          : `${who} has not uploaded a tier list yet.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  // The whole-pool image heads the reply; per-role ones follow, since Discord
  // allows only one image per embed.
  const whole = images.find((img) => img.position === WHOLE_POOL)
  const perRole = images.filter((img) => img.position !== WHOLE_POOL)

  const files: AttachmentBuilder[] = []
  const header = baseEmbed().setAuthor({
    name: `${who.displayName} — champion pool`,
    iconURL: who.displayAvatarURL(),
  })

  if (whole) {
    files.push(new AttachmentBuilder(pathFor(whole.file), { name: whole.file }))
    header.setImage(`attachment://${whole.file}`)
  } else {
    header.setDescription(
      `${perRole.length} role${perRole.length === 1 ? '' : 's'} covered: ${perRole
        .map((img) => img.position)
        .join(', ')}`,
    )
  }

  const embeds = [header]
  for (const image of perRole.slice(0, 9)) {
    files.push(new AttachmentBuilder(pathFor(image.file), { name: image.file }))
    embeds.push(baseEmbed().setTitle(image.position).setImage(`attachment://${image.file}`))
  }

  await i.reply({ embeds, files })
}

async function showTeamPool(i: Parameters<Command['execute']>[0], team: TeamKey) {
  if (!i.guild) return
  await i.deferReply()

  const roster = await rosterMembers(i.guild, team)
  if (!roster.length) {
    await i.editReply(`Nobody has the **${TEAM_ROLE[team]}** role yet.`)
    return
  }

  // One image each, so a five-man roster fits in a single message. The
  // whole-pool image is the right one to show when a player has several.
  const shown: { name: string; icon: string; position: string; file: string }[] = []
  const missing: string[] = []

  for (const member of roster) {
    const images = poolImages.forPlayer(member.id)
    const pick = images.find((img) => img.position === WHOLE_POOL) ?? images[0]
    if (!pick) {
      missing.push(member.displayName)
      continue
    }
    shown.push({
      name: member.displayName,
      icon: member.displayAvatarURL(),
      position: pick.position,
      file: pick.file,
    })
  }

  const header = baseEmbed().setTitle(`${TEAM_ROLE[team]} — champion pools`)
  const overflow = shown.length - MAX_PLAYERS

  header.setDescription(
    shown.length
      ? `${shown.length} of ${roster.length} players have uploaded a tier list.`
      : 'Nobody on this roster has uploaded a tier list yet. They add one with `/pool upload`.',
  )
  if (missing.length) {
    header.addFields({ name: 'Nothing uploaded', value: missing.join(', ').slice(0, 1024) })
  }
  if (overflow > 0) {
    header.addFields({
      name: 'Too many to show',
      value: `Showing the first ${MAX_PLAYERS}. Use \`/pool view user:\` for the other ${overflow}.`,
    })
  }

  const embeds = [header]
  const files: AttachmentBuilder[] = []

  for (const player of shown.slice(0, MAX_PLAYERS)) {
    files.push(new AttachmentBuilder(pathFor(player.file), { name: player.file }))
    embeds.push(
      baseEmbed()
        .setAuthor({
          name: player.position === WHOLE_POOL ? player.name : `${player.name} — ${player.position}`,
          iconURL: player.icon,
        })
        .setImage(`attachment://${player.file}`),
    )
  }

  await i.editReply({ embeds, files })
}
