import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type Message,
} from 'discord.js'
import { scrims } from '../db.js'
import { baseEmbed } from '../format.js'
import { isStaff } from '../util.js'
import type { Command } from './types.js'

const ANSWERS = [
  { id: 'scrim-yes', label: 'In', answer: 'yes', style: ButtonStyle.Success },
  { id: 'scrim-maybe', label: 'Maybe', answer: 'maybe', style: ButtonStyle.Secondary },
  { id: 'scrim-no', label: 'Out', answer: 'no', style: ButtonStyle.Danger },
] as const

export const scrim: Command = {
  data: new SlashCommandBuilder()
    .setName('scrim')
    .setDescription('Post a scrim and collect who is in')
    .addStringOption((o) =>
      o.setName('when').setDescription('When it is, e.g. "Thursday 8pm"').setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName('team')
        .setDescription('Which roster')
        .setRequired(true)
        .addChoices({ name: 'A Team', value: 'a' }, { name: 'B Team', value: 'b' }),
    )
    .addStringOption((o) => o.setName('opponent').setDescription('Who against')),

  async execute(i) {
    if (!i.guild || !i.channel || !('send' in i.channel)) return

    if (!isStaff(i.member as never)) {
      await i.reply({ content: 'Only staff and captains can post scrims.', flags: MessageFlags.Ephemeral })
      return
    }

    const when = i.options.getString('when', true)
    const team = i.options.getString('team', true)
    const opponent = i.options.getString('opponent')

    await i.reply({ content: 'Posted.', flags: MessageFlags.Ephemeral })

    const message = await i.channel.send({
      embeds: [buildEmbed({ team, when, opponent, answers: [] }, i.guild.id)],
      components: [buttons()],
    })

    scrims.create({
      message_id: message.id,
      channel_id: message.channelId,
      team,
      opponent,
      when_text: when,
      created_by: i.user.id,
    })
  },
}

function buttons() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    ANSWERS.map((a) => new ButtonBuilder().setCustomId(a.id).setLabel(a.label).setStyle(a.style)),
  )
}

function buildEmbed(
  scrimData: { team: string; when: string; opponent: string | null; answers: { discord_id: string; answer: string }[] },
  _guildId: string,
) {
  const named = (answer: string) =>
    scrimData.answers.filter((a) => a.answer === answer).map((a) => `<@${a.discord_id}>`)

  const yes = named('yes')
  const maybe = named('maybe')
  const no = named('no')

  const embed = baseEmbed()
    .setTitle(`${scrimData.team === 'a' ? 'A Team' : 'B Team'} scrim`)
    .setDescription(
      `**When:** ${scrimData.when}` + (scrimData.opponent ? `\n**Against:** ${scrimData.opponent}` : ''),
    )
    .addFields(
      { name: `In (${yes.length})`, value: yes.join('\n') || '—', inline: true },
      { name: `Maybe (${maybe.length})`, value: maybe.join('\n') || '—', inline: true },
      { name: `Out (${no.length})`, value: no.join('\n') || '—', inline: true },
    )

  if (yes.length >= 5) embed.setFooter({ text: 'Royal Bears · full five' })
  return embed
}

export function isScrimButton(customId: string): boolean {
  return ANSWERS.some((a) => a.id === customId)
}

export async function handleScrimButton(i: ButtonInteraction) {
  const record = scrims.get(i.message.id)
  if (!record) {
    await i.reply({ content: 'This scrim is no longer tracked.', flags: MessageFlags.Ephemeral })
    return
  }

  const choice = ANSWERS.find((a) => a.id === i.customId)!
  scrims.rsvp(i.message.id, i.user.id, choice.answer)

  await i.update({
    embeds: [
      buildEmbed(
        {
          team: record.team,
          when: record.when_text,
          opponent: record.opponent,
          answers: scrims.answers(i.message.id),
        },
        i.guildId!,
      ),
    ],
    components: [buttons()],
  })
}

export type ScrimMessage = Message
