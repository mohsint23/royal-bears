/**
 * Tryout tickets.
 *
 * Taking the Tryout role opens a private #tryout-<name> channel where the bot
 * asks six questions one at a time, then posts a summary card with staff
 * buttons. The questions and naming rules live in ticketFlow.ts; this file is
 * the Discord side: channels, permissions, messages, buttons.
 *
 * State is one tryout_tickets row per applicant, written as each answer
 * arrives, so a restart resumes rather than starting over.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  MessageFlags,
  PermissionFlagsBits as P,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type Message,
  type OverwriteResolvable,
  type TextChannel,
} from 'discord.js'
import { config, ROLE_NAMES, STAFF_ROLES } from './config.js'
import { accounts, riotId, tickets, ticketAnswers, type Ticket } from './db.js'
import { baseEmbed, GOLD, GREEN, RED, opggLink } from './format.js'
import {
  channelName,
  MAX_ANSWER,
  nextQuestion,
  nudgeDue,
  QUESTIONS,
  type TicketStatus,
} from './ticketFlow.js'
import { isStaff } from './util.js'

export const TRYOUT_CATEGORY = '🎯 TRYOUTS'
export const TRYOUT_ROLE = 'Tryout'

const PREFIX = 'ticket:'
const BUTTON = {
  trialling: `${PREFIX}trialling`,
  accept: `${PREFIX}accept`,
  decline: `${PREFIX}decline`,
  close: `${PREFIX}close`,
} as const

/** The people a finished card pings. */
const REVIEWER_ROLES = [ROLE_NAMES.captainA, ROLE_NAMES.captainB, ROLE_NAMES.officer]

const NUDGE_EVERY = 60 * 60 * 1000

export const isTicketButton = (customId: string) => customId.startsWith(PREFIX)

// ---------------------------------------------------------------------------
// Opening

/**
 * The same person can trigger an open twice in a row (the role button adds
 * the role, which also fires GuildMemberUpdate). Second caller waits on the
 * first instead of making a second channel.
 */
const inFlight = new Map<string, Promise<TextChannel>>()

export async function openTicket(
  guild: Guild,
  member: GuildMember,
): Promise<{ channel: TextChannel; created: boolean }> {
  const existing = await liveChannel(guild, tickets.activeFor(member.id))
  if (existing) return { channel: existing, created: false }

  const pending = inFlight.get(member.id)
  if (pending) return { channel: await pending, created: false }

  const creating = createTicket(guild, member).finally(() => inFlight.delete(member.id))
  inFlight.set(member.id, creating)
  return { channel: await creating, created: true }
}

/** The ticket's channel if it still exists; closes the row if it does not. */
async function liveChannel(guild: Guild, ticket: Ticket | undefined): Promise<TextChannel | undefined> {
  if (!ticket) return undefined
  const channel = await guild.channels.fetch(ticket.channel_id).catch(() => null)
  if (channel?.type === ChannelType.GuildText) return channel as TextChannel
  tickets.setStatus(ticket.channel_id, 'closed')
  return undefined
}

async function createTicket(guild: Guild, member: GuildMember): Promise<TextChannel> {
  const category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name === TRYOUT_CATEGORY,
  )
  if (!category) throw new Error(`No "${TRYOUT_CATEGORY}" category — run "npm run setup".`)

  const channel = await guild.channels.create({
    name: channelName('open', member.user.username),
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `Tryout ticket for ${member.user.tag}`,
    permissionOverwrites: overwrites(guild, member),
    reason: `Tryout ticket for ${member.user.tag}`,
  })

  tickets.create({ channel_id: channel.id, discord_id: member.id, username: member.user.username })

  await channel.send(
    `<@${member.id}> welcome — just you and the captains in here. Six quick questions, one message each.\n${QUESTIONS[0].prompt}`,
  )
  return channel
}

/**
 * Explicit on every side: the category denies @everyone, so the applicant,
 * each staff role and the bot itself all need their own allow.
 */
function overwrites(guild: Guild, member: GuildMember): OverwriteResolvable[] {
  const read = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory]
  const list: OverwriteResolvable[] = [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
    { id: member.id, allow: read },
  ]
  for (const name of STAFF_ROLES) {
    const role = guild.roles.cache.find((r) => r.name === name)
    if (role) list.push({ id: role.id, allow: read })
  }
  const me = guild.members.me
  if (me) list.push({ id: me.id, allow: [...read, P.ManageChannels, P.AddReactions] })
  return list
}

// ---------------------------------------------------------------------------
// Answers

export async function handleTicketMessage(message: Message) {
  if (message.author.bot || !message.inGuild()) return
  const ticket = tickets.byChannel(message.channelId)
  if (!ticket || ticket.discord_id !== message.author.id || ticket.status !== 'open') return

  const answers = ticketAnswers(ticket)
  const question = nextQuestion(answers)
  if (!question) return

  const text = message.content.trim()
  if (!text) {
    await message.reply('Text please — I can only read typed answers.')
    return
  }
  if (text.length > MAX_ANSWER) {
    await message.reply(`Bit long — keep it under ${MAX_ANSWER} characters so it fits on the card.`)
    return
  }

  tickets.answer(ticket.channel_id, question.key, text)
  answers[question.key] = text
  await message.react('✅').catch(() => {})

  const next = nextQuestion(answers)
  if (next) {
    await message.channel.send(next.prompt)
    return
  }
  await postSummary(message.channel as TextChannel, tickets.byChannel(ticket.channel_id)!)
}

async function postSummary(channel: TextChannel, ticket: Ticket) {
  const guild = channel.guild
  const main = accounts.mainFor(ticket.discord_id)

  const embed = baseEmbed()
    .setColor(GOLD)
    .setTitle('Tryout application')
    .setDescription(`<@${ticket.discord_id}>`)
    .addFields(
      ...QUESTIONS.map((q) => ({ name: q.label, value: ticket[q.key] || '—', inline: q.key.endsWith('_rank') || q.key.endsWith('_role') })),
      {
        name: 'op.gg',
        value: main
          ? `[${riotId(main)}](${opggLink(main.game_name, main.tag_line)})`
          : 'Not linked — they can run `/register` to add it',
      },
    )

  const reviewers = REVIEWER_ROLES.map((name) => guild.roles.cache.find((r) => r.name === name))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))

  const sent = await channel.send({
    content: `${reviewers.map((r) => `<@&${r.id}>`).join(' ')} application in from <@${ticket.discord_id}>.`.trim(),
    embeds: [embed],
    components: [buttons()],
    allowedMentions: { roles: reviewers.map((r) => r.id), users: [ticket.discord_id] },
  })
  tickets.setSummary(ticket.channel_id, sent.id)

  await channel.send(`Done <@${ticket.discord_id}> — a captain will reply here in a few days.`)
}

function buttons() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(BUTTON.trialling).setLabel('Trialling').setEmoji('🎯').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(BUTTON.accept).setLabel('Accept').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(BUTTON.decline).setLabel('Decline').setEmoji('🚫').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(BUTTON.close).setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
  )
}

// ---------------------------------------------------------------------------
// Staff buttons

const DM: Record<'accepted' | 'declined', string> = {
  accepted:
    "Good news — you've been **accepted** onto a Royal Bears roster. A captain will sort the details in your ticket. Welcome in.",
  declined:
    "Thanks for trying out for Royal Bears. It's a **no for this term**, but rosters change every term, so do apply again. " +
    'Playing in #looking-for-game is the fastest way to get noticed.',
}

export async function handleTicketButton(i: ButtonInteraction) {
  if (!i.inCachedGuild()) return
  if (!isStaff(i.member)) {
    await i.reply({ content: 'Only staff and captains can do that.', flags: MessageFlags.Ephemeral })
    return
  }
  const ticket = tickets.byChannel(i.channelId)
  const channel = i.channel
  if (!ticket || !channel || channel.type !== ChannelType.GuildText) {
    await i.reply({ content: "This isn't a ticket channel any more.", flags: MessageFlags.Ephemeral })
    return
  }

  if (i.customId === BUTTON.close) {
    tickets.setStatus(ticket.channel_id, 'closed')
    await i.reply({ content: 'Closing — the answers are saved.', flags: MessageFlags.Ephemeral })
    await channel.delete(`Tryout ticket closed by ${i.user.tag}`)
    return
  }

  const status = i.customId.slice(PREFIX.length) as TicketStatus
  if (!['trialling', 'accepted', 'declined'].includes(status)) return

  if (ticket.status === status) {
    await i.reply({ content: `Already marked **${status}**.`, flags: MessageFlags.Ephemeral })
    return
  }

  await i.deferReply({ flags: MessageFlags.Ephemeral })
  tickets.setStatus(ticket.channel_id, status)
  // Renames are rate-limited to two per ten minutes per channel; a failure
  // here should not undo the decision, so it is logged and moved past.
  await channel.setName(channelName(status, ticket.username)).catch((err) => console.error('[tickets] rename:', err))

  const colour = status === 'accepted' ? GREEN : status === 'declined' ? RED : GOLD
  await channel.send({
    embeds: [baseEmbed().setColor(colour).setDescription(`<@${i.user.id}> marked this **${status}**.`)],
  })

  if (status === 'accepted' || status === 'declined') {
    const member = await i.guild.members.fetch(ticket.discord_id).catch(() => null)
    const sent = member ? await member.send(DM[status]).then(() => true).catch(() => false) : false
    if (!sent) {
      await channel.send(`Couldn't DM <@${ticket.discord_id}> — their DMs are closed, so tell them here.`)
    }
  }
  await i.editReply({ content: `Marked **${status}**.` })
}

// ---------------------------------------------------------------------------
// Boot and background

/** After a restart, re-ask the pending question on any ticket left hanging. */
export async function resumeTickets(client: Client) {
  const guild = await client.guilds.fetch(config.guildId).catch(() => null)
  if (!guild) return
  let resumed = 0
  for (const ticket of tickets.active()) {
    const channel = await liveChannel(guild, ticket)
    if (!channel || ticket.status !== 'open') continue
    const next = nextQuestion(ticketAnswers(ticket))
    if (!next) continue
    const last = (await channel.messages.fetch({ limit: 1 }).catch(() => null))?.first()
    if (last?.author.id === client.user?.id) continue
    await channel.send(next.prompt).catch((err) => console.error('[tickets] resume:', err))
    resumed++
  }
  if (resumed) console.log(`Resumed ${resumed} tryout ticket(s).`)
}

/** One nudge per ticket after a day of silence, checked hourly. */
export function startTicketNudges(client: Client) {
  const tick = async () => {
    const guild = await client.guilds.fetch(config.guildId).catch(() => null)
    if (!guild) return
    for (const ticket of tickets.active()) {
      if (!nudgeDue({ answers: ticketAnswers(ticket), last_activity: ticket.last_activity, nudged_at: ticket.nudged_at }, Date.now())) continue
      const channel = await liveChannel(guild, ticket)
      const next = nextQuestion(ticketAnswers(ticket))
      if (!channel || !next) continue
      tickets.markNudged(ticket.channel_id)
      await channel
        .send(`<@${ticket.discord_id}> still here? Whenever you're ready:\n${next.prompt}`)
        .catch((err) => console.error('[tickets] nudge:', err))
    }
  }
  setInterval(() => tick().catch((err) => console.error('[tickets] nudge tick:', err)), NUDGE_EVERY)
}
