/**
 * #player-database: every tryout applicant on one screen, kept current by the
 * bot. The top message carries the spreadsheet; below it one card per team
 * bucket with a field per applicant. Re-rendered whenever a ticket changes.
 */

import { AttachmentBuilder, ChannelType, EmbedBuilder, type Client, type Guild, type TextChannel } from 'discord.js'
import { applicantsFilename, applicantsWorkbook } from './applicants.js'
import { config } from './config.js'
import { accounts, tickets, ticketAnswers, type Ticket } from './db.js'
import { baseEmbed, BRAND, GOLD, GREEN, GREY } from './format.js'
import { opggUrl } from './tickets.js'
import { isComplete, QUESTIONS, type TeamChoice } from './ticketFlow.js'
import { syncBotMessages } from './util.js'

const STATUS: Record<string, string> = {
  open: '📝',
  trialling: '🎯',
  accepted: '✅',
  declined: '🚫',
  closed: '🔒',
}

const BUCKETS: { team: TeamChoice; title: string; colour: number }[] = [
  { team: 'A', title: 'Applying for A Team', colour: GOLD },
  { team: 'B', title: 'Applying for B Team', colour: BRAND },
  { team: 'A and B', title: 'Happy with A or B', colour: GREEN },
]

/** Discord caps an embed at 25 fields. */
const PER_EMBED = 24

function card(t: Ticket): { name: string; value: string; inline: boolean } {
  const link = opggUrl(t.riot_id, accounts.mainFor(t.discord_id))
  const ign = link ? `[${link.label}](${link.url})` : (t.riot_id ?? '—')
  const lines = [
    `${ign}${t.year ? ` · ${t.year.replace(/\s*year$/i, '')} year` : ''}`,
    `Peak **${t.peak_rank ?? '—'}** · Now **${t.current_rank ?? '—'}**`,
    `${t.main_role ?? '—'}${t.secondary_roles && !/^no$/i.test(t.secondary_roles.trim()) ? ` · also ${t.secondary_roles}` : ''}`,
  ]
  return { name: `${STATUS[t.status] ?? ''} ${t.username}`, value: lines.join('\n'), inline: true }
}

function progress(t: Ticket): { name: string; value: string; inline: boolean } {
  const done = Object.keys(ticketAnswers(t)).length
  return { name: `${STATUS.open} ${t.username}`, value: `${done}/${QUESTIONS.length} answered`, inline: true }
}

/** The messages the channel should hold, top to bottom. */
export async function playerDatabaseBodies(rows: Ticket[] = tickets.all()) {
  const finished = rows.filter((t) => isComplete(ticketAnswers(t)))
  const pending = rows.filter((t) => !isComplete(ticketAnswers(t)) && t.closed_at === null)

  const counts = {
    accepted: finished.filter((t) => t.status === 'accepted').length,
    trialling: finished.filter((t) => t.status === 'trialling').length,
    waiting: finished.filter((t) => t.status === 'open').length,
  }
  const header = baseEmbed()
    .setColor(BRAND)
    .setTitle('Player database')
    .setDescription(
      `**${finished.length}** application${finished.length === 1 ? '' : 's'}` +
        (pending.length ? ` · ${pending.length} still answering` : '') +
        `\n✅ ${counts.accepted} accepted · 🎯 ${counts.trialling} trialling · 📝 ${counts.waiting} waiting on a captain` +
        '\n\nSpreadsheet attached — tier lists are in there. Updated <t:' + Math.floor(Date.now() / 1000) + ':R>.',
    )
  const bodies: { embeds: EmbedBuilder[]; files?: AttachmentBuilder[] }[] = [
    { embeds: [header], files: [new AttachmentBuilder(await applicantsWorkbook(rows), { name: applicantsFilename() })] },
  ]

  for (const bucket of BUCKETS) {
    const members = finished.filter((t) => t.team === bucket.team)
    for (let i = 0; i < members.length; i += PER_EMBED) {
      const page = members.slice(i, i + PER_EMBED)
      const embed = baseEmbed()
        .setColor(bucket.colour)
        .setTitle(members.length > PER_EMBED ? `${bucket.title} (${i / PER_EMBED + 1})` : bucket.title)
        .addFields(page.map(card))
      bodies.push({ embeds: [embed] })
    }
  }

  if (pending.length) {
    bodies.push({
      embeds: [baseEmbed().setColor(GREY).setTitle('Still answering').addFields(pending.slice(0, PER_EMBED).map(progress))],
    })
  }
  return bodies
}

/** Re-renders the channel. Safe to call often; a missing channel is a no-op. */
export async function refreshPlayerDatabase(guild: Guild): Promise<void> {
  const channel = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === config.playerDbChannel,
  ) as TextChannel | undefined
  if (!channel || !guild.client.user) return
  await syncBotMessages(channel, guild.client.user.id, await playerDatabaseBodies())
}

export async function refreshPlayerDatabaseFor(client: Client): Promise<void> {
  const guild = await client.guilds.fetch(config.guildId).catch(() => null)
  if (guild) await refreshPlayerDatabase(guild).catch((err) => console.error('[player-db] refresh:', err))
}
