import {
  AttachmentBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { POSITIONS } from '../config.js'
import { poolImages, WHOLE_POOL } from '../db.js'
import { baseEmbed } from '../format.js'
import { pathFor, removeImage, saveImage } from '../images.js'
import type { Command } from './types.js'

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
        .setDescription("Show a player's tier list")
        .addUserOption((o) =>
          o.setName('user').setDescription('Which player — pick yourself for your own').setRequired(true),
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
  const who = i.options.getUser('user', true)
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
