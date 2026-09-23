/**
 * Tryout tickets.
 *
 * Pressing the button under #tryout-info opens a private #tryout-<name>
 * channel where the bot asks ten questions one at a time, then posts a summary card with staff
 * buttons. The questions and naming rules live in ticketFlow.ts; this file is
 * the Discord side: channels, permissions, messages, buttons.
 *
 * State is one tryout_tickets row per applicant, written as each answer
 * arrives, so a restart resumes rather than starting over.
 */

import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  ActionRowBuilder,
  AttachmentBuilder,
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
import { accounts, riotId, tickets, ticketAnswers, type Account, type Ticket } from './db.js'
import { baseEmbed, GOLD, GREEN, RED, opggLink } from './format.js'
import { fetchImage } from './images.js'
import { refreshPlayerDatabase } from './playerDatabase.js'
import {
  channelName,
  MAX_ANSWER,
  nextQuestion,
  nudgeDue,
  parseRiotId,
  parseTeam,
  QUESTIONS,
  TIERMAKER,
  type Question,
  type TicketStatus,
} from './ticketFlow.js'
import { isStaff } from './util.js'

export const TRYOUT_CATEGORY = '🎯 TRYOUTS'
export const TRYOUT_ROLE = 'Tryout'

const PREFIX = 'ticket:'
const BUTTON = {
  open: `${PREFIX}open`,
  trialling: `${PREFIX}trialling`,
  accept: `${PREFIX}accept`,
  decline: `${PREFIX}decline`,
  close: `${PREFIX}close`,
} as const

/** The people a finished card pings. */
const REVIEWER_ROLES = [ROLE_NAMES.captainA, ROLE_NAMES.captainB, ROLE_NAMES.officer]

const NUDGE_EVERY = 60 * 60 * 1000

/** Tier-list uploads live next to the database, like pool images, because Discord's attachment URLs expire. */
const TIER_DIR = join(dirname(config.databasePath), 'tier-lists')
mkdirSync(TIER_DIR, { recursive: true })
export const tierListPath = (file: string) => join(TIER_DIR, file)

export const isTicketButton = (customId: string) => customId.startsWith(PREFIX)

// ---------------------------------------------------------------------------
// Opening

/**
 * Two quick presses of the button must not make two channels: the second
 * caller waits on the first and gets the same channel back.
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
  tickets.close(ticket.channel_id)
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
    `<@${member.id}> welcome — just you and the captains in here. ${QUESTIONS.length} quick questions, one message each.\n${QUESTIONS[0]!.prompt}`,
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

  const text = await readAnswer(message, question, ticket)
  if (text === undefined) return

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

/** The Riot ID they typed, as an op.gg link; falls back to their /register main. */
export function opggUrl(typed: string | null, main: Account | undefined): { label: string; url: string } | undefined {
  const parsed = typed ? parseRiotId(typed) : undefined
  if (parsed) return { label: `${parsed.gameName}#${parsed.tagLine}`, url: opggLink(parsed.gameName, parsed.tagLine) }
  if (main) return { label: riotId(main), url: opggLink(main.game_name, main.tag_line) }
  return undefined
}

function opggField(typed: string | null, main: Account | undefined): string {
  const link = opggUrl(typed, main)
  return link ? `[${link.label}](${link.url})` : '—'
}

/** The stored tier list as a Discord attachment, if the file is still there. */
export function tierListFile(ticket: Ticket): AttachmentBuilder | undefined {
  if (!ticket.tier_list || !existsSync(tierListPath(ticket.tier_list))) return undefined
  return new AttachmentBuilder(tierListPath(ticket.tier_list), { name: ticket.tier_list })
}

/** The card staff read. Exported so preview.ts can render it without Discord. */
export function summaryEmbed(ticket: Ticket, main: Account | undefined) {
  return baseEmbed()
    .setColor(GOLD)
    .setTitle('Tryout application')
    .setDescription(`<@${ticket.discord_id}>`)
    .addFields(
      ...QUESTIONS.filter((q) => q.kind !== 'image').map((q) => ({
        name: q.key === 'riot_id' ? 'op.gg' : q.label,
        value: q.key === 'riot_id' ? opggField(ticket.riot_id, main) : ticket[q.key] || '—',
        inline: q.key === 'year' || q.key === 'team' || q.key.endsWith('_rank') || q.key.endsWith('_role'),
      })),
    )
    .setImage(ticket.tier_list ? `attachment://${ticket.tier_list}` : null)
}

export const summaryButtons = () =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(BUTTON.trialling).setLabel('Trialling').setEmoji('🎯').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(BUTTON.accept).setLabel('Accept').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(BUTTON.decline).setLabel('Decline').setEmoji('🚫').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(BUTTON.close).setLabel('Close').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
  )

/**
 * Turns the message into the stored answer for this question, or replies with
 * what was wrong and returns undefined. Images are downloaded to disk here.
 */
async function readAnswer(message: Message<true>, question: Question, ticket: Ticket): Promise<string | undefined> {
  if (question.kind === 'image') {
    const attachment = message.attachments.find((a) => a.contentType?.startsWith('image/'))
    if (!attachment) {
      await message.reply(`Upload the tier list as an image (make it at <${TIERMAKER}>, then the download button).`)
      return undefined
    }
    const fetched = await fetchImage(attachment)
    if (!fetched.ok) {
      await message.reply(fetched.reason)
      return undefined
    }
    const file = `${ticket.discord_id}.${fetched.extension}`
    writeFileSync(tierListPath(file), fetched.bytes)
    return file
  }

  const text = message.content.trim()
  if (!text) {
    await message.reply('Text please — I can only read typed answers.')
    return undefined
  }
  if (text.length > MAX_ANSWER) {
    await message.reply(`Bit long — keep it under ${MAX_ANSWER} characters so it fits on the card.`)
    return undefined
  }
  if (question.kind === 'team') {
    const team = parseTeam(text)
    if (!team) {
      await message.reply('Just **A**, **B**, or **A and B**.')
      return undefined
    }
    return team
  }
  if (question.key === 'riot_id' && !parseRiotId(text)) {
    await message.reply('Needs to be `Name#TAG` — the bit after the # is on your Riot profile.')
    return undefined
  }
  return text
}

async function postSummary(channel: TextChannel, ticket: Ticket) {
  const guild = channel.guild
  const reviewers = REVIEWER_ROLES.map((name) => guild.roles.cache.find((r) => r.name === name))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))

  const sent = await channel.send({
    content: `${reviewers.map((r) => `<@&${r.id}>`).join(' ')} application in from <@${ticket.discord_id}>.`.trim(),
    embeds: [summaryEmbed(ticket, accounts.mainFor(ticket.discord_id))],
    files: [tierListFile(ticket)].filter((f): f is AttachmentBuilder => Boolean(f)),
    components: [summaryButtons()],
    allowedMentions: { roles: reviewers.map((r) => r.id), users: [ticket.discord_id] },
  })
  tickets.setSummary(ticket.channel_id, sent.id)

  await channel.send(`Done <@${ticket.discord_id}> — a captain will reply here in a few days.`)
  await refreshPlayerDatabase(guild).catch((err) => console.error('[player-db] after summary:', err))
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

/** The button under the #tryout-info explainer. One per person: pressing it again links the open ticket. */
export const panelRow = () =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(BUTTON.open).setLabel('Open a tryout ticket').setEmoji('📩').setStyle(ButtonStyle.Success),
  )

async function handleOpenButton(i: ButtonInteraction<'cached'>) {
  const member = i.member
  if (!member.roles.cache.some((r) => r.name === TRYOUT_ROLE)) {
    const getRoles = i.guild.channels.cache.find((c) => c.name === 'get-roles')
    await i.reply({
      content: `Grab the **Tryout** role first — hit **I'm here to trial** in ${getRoles ?? '#get-roles'}, then come back and press this.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral })
  try {
    const { channel, created } = await openTicket(i.guild, member)
    await i.editReply({
      content: created ? `Your ticket is open: ${channel}. Answer the questions there.` : `You already have one open: ${channel}.`,
    })
  } catch (err) {
    console.error('[tickets] open from panel:', err)
    await i.editReply({ content: "Couldn't open your ticket — ping a captain and they'll sort it." })
  }
}

export async function handleTicketButton(i: ButtonInteraction) {
  if (!i.inCachedGuild()) return
  if (i.customId === BUTTON.open) {
    await handleOpenButton(i)
    return
  }
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
    tickets.close(ticket.channel_id)
    await i.reply({ content: 'Closing — the answers are saved.', flags: MessageFlags.Ephemeral })
    await channel.delete(`Tryout ticket closed by ${i.user.tag}`)
    await refreshPlayerDatabase(i.guild).catch((err) => console.error('[player-db] after close:', err))
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
  await refreshPlayerDatabase(i.guild).catch((err) => console.error('[player-db] after status:', err))
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
