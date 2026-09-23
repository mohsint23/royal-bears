/**
 * #player-database: every tryout applicant on one screen, kept current by the
 * bot. The top message carries the spreadsheet; below it one card per team
 * bucket with a field per applicant. Re-rendered whenever a ticket changes.
 */

import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, type Client, type Guild, type TextChannel } from 'discord.js'
import { applicantsFilename, applicantsWorkbook } from './applicants.js'
import { config } from './config.js'
import { accounts, tickets, ticketAnswers, type Ticket } from './db.js'
import { baseEmbed, BRAND, GREY, tierColour } from './format.js'
import { opggUrl, tierListFile } from './tickets.js'
import { isComplete, QUESTIONS, type TeamChoice } from './ticketFlow.js'
import { pushToGoogleSheet } from './sheet.js'
import { syncBotMessages } from './util.js'

const STATUS: Record<string, string> = {
  open: '📝',
  trialling: '🎯',
  accepted: '✅',
  declined: '🚫',
  closed: '🔒',
}

const TEAM_LABEL: Record<TeamChoice, string> = { A: 'A Team', B: 'B Team', 'A and B': 'A or B Team' }
const TEAM_ORDER: TeamChoice[] = ['A', 'B', 'A and B']

const STATUS_LABEL: Record<string, string> = {
  open: 'Waiting on a captain',
  trialling: 'Trialling',
  accepted: 'Accepted',
  declined: 'Declined',
  closed: 'Closed without a decision',
}

/** "Emerald 2", "plat 3", "M254" → the tier colour, or grey when unreadable. */
function colourFor(peak: string | null): number {
  const word = (peak ?? '').trim().toLowerCase()
  const tier: Record<string, string> = {
    iron: 'IRON', bronze: 'BRONZE', silver: 'SILVER', gold: 'GOLD', plat: 'PLATINUM', platinum: 'PLATINUM',
    emerald: 'EMERALD', dia: 'DIAMOND', diamond: 'DIAMOND', master: 'MASTER', masters: 'MASTER', m: 'MASTER',
    gm: 'GRANDMASTER', grandmaster: 'GRANDMASTER', chall: 'CHALLENGER', challenger: 'CHALLENGER',
  }
  const key = Object.keys(tier).find((k) => word.startsWith(k) && !/^[a-z]/.test(word.slice(k.length)))
  return key ? tierColour(tier[key]) : GREY
}

/** One full card per applicant: every answer as a field, tier list as the picture. */
export function applicantCard(t: Ticket): { embeds: EmbedBuilder[]; files: AttachmentBuilder[] } {
  const link = opggUrl(t.riot_id, accounts.mainFor(t.discord_id))
  const other = t.secondary_roles?.trim() || '—'
  const embed = baseEmbed()
    .setColor(colourFor(t.peak_rank))
    .setTitle(`${STATUS[t.status] ?? ''} ${t.username}`)
    .setDescription(`<@${t.discord_id}> · applying for **${t.team ? TEAM_LABEL[t.team as TeamChoice] : '—'}**`)
    .addFields(
      { name: 'IGN / op.gg', value: link ? `[${link.label}](${link.url})` : (t.riot_id ?? '—'), inline: true },
      { name: 'Year', value: t.year ?? '—', inline: true },
      { name: 'Status', value: STATUS_LABEL[t.status] ?? t.status, inline: true },
      { name: 'Peak rank', value: t.peak_rank ?? '—', inline: true },
      { name: 'Current rank', value: t.current_rank ?? '—', inline: true },
      { name: 'Applied', value: `<t:${Math.floor(t.created_at / 1000)}:d>`, inline: true },
      { name: 'Main role', value: t.main_role ?? '—', inline: true },
      { name: 'Open to other roles?', value: other, inline: true },
    )
  const file = tierListFile(t)
  if (file) embed.setImage(`attachment://${t.tier_list}`)
  else embed.addFields({ name: 'Tier list', value: t.tier_list ? 'file missing' : 'not uploaded' })
  return { embeds: [embed], files: file ? [file] : [] }
}

function progress(t: Ticket): { name: string; value: string; inline: boolean } {
  const done = Object.keys(ticketAnswers(t)).length
  return { name: `${STATUS.open} ${t.username}`, value: `${done}/${QUESTIONS.length} answered`, inline: true }
}

/** Discord caps an embed at 25 fields. */
const PER_EMBED = 24

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
        '\n\nOne card per applicant below, tier list included. ' +
        (config.sheetUrl ? 'The Google Sheet is the shareable version. ' : 'Spreadsheet attached. ') +
        'Updated <t:' + Math.floor(Date.now() / 1000) + ':R>.',
    )
  const bodies: { embeds: EmbedBuilder[]; files?: AttachmentBuilder[]; components?: ActionRowBuilder<ButtonBuilder>[] }[] = [
    {
      embeds: [header],
      files: [new AttachmentBuilder(await applicantsWorkbook(rows), { name: applicantsFilename() })],
      components: config.sheetUrl
        ? [new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Open the Google Sheet').setEmoji('📊').setURL(config.sheetUrl),
          )]
        : [],
    },
  ]

  // Grouped by team, then oldest application first, so the order is stable.
  const sorted = [...finished].sort(
    (a, b) => TEAM_ORDER.indexOf(a.team as TeamChoice) - TEAM_ORDER.indexOf(b.team as TeamChoice) || a.created_at - b.created_at,
  )
  for (const t of sorted) bodies.push(applicantCard(t))

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
  const rows = tickets.all()
  await syncBotMessages(channel, guild.client.user.id, await playerDatabaseBodies(rows))
  await pushToGoogleSheet(rows).catch((err) => console.error('[sheet] push failed:', err))
}

export async function refreshPlayerDatabaseFor(client: Client): Promise<void> {
  const guild = await client.guilds.fetch(config.guildId).catch(() => null)
  if (guild) await refreshPlayerDatabase(guild).catch((err) => console.error('[player-db] refresh:', err))
}
