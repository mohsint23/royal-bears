/**
 * The games check.
 *
 * Every player on a roster is expected to get through a number of ranked games
 * a week, counted across every account they have linked. This posts who is on
 * track and who is not, in a channel the players themselves cannot see.
 *
 * It runs every morning. Monday is the exception: at that point the week has
 * barely started, so Monday reports the *finished* week instead and is the only
 * day that pings anybody. The rest of the week is a pace check.
 */

import type { Client, Guild, TextChannel } from 'discord.js'
import { ChannelType } from 'discord.js'
import { RANKED_QUEUE_IDS, WEEKLY_GAME_TARGET, config } from '../config.js'
import { accounts, matches, settings, type MatchRow } from '../db.js'
import { baseEmbed, GOLD, GREEN, RED, winrate } from '../format.js'
import { KeyExpiredError } from '../riot.js'
import { syncAccount } from '../sync.js'
import { champLine, champProgress } from '../champs.js'
import { rosterMembers, teamOf, TEAM_ROLE, type TeamKey } from '../util.js'
import { staffMention } from './announce.js'

const LAST_RUN = 'last_attendance'
const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY
const ZONE = 'Europe/London'

/** Riot caps a match-id request at 100, far more than a week of games. */
const MATCH_PAGE = 100

const ranked = (games: MatchRow[]) => games.filter((g) => RANKED_QUEUE_IDS.includes(g.queue_id))

/** How far the zone is ahead of UTC at a given instant, in milliseconds. */
function zoneOffset(at: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]))
  const asUTC = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour! % 24, +p.minute!, +p.second!)
  return asUTC - at.getTime()
}

export function londonParts(at = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE, weekday: 'short', hour: 'numeric', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const p = Object.fromEntries(fmt.formatToParts(at).map((x) => [x.type, x.value]))
  return { weekday: p.weekday!, hour: Number(p.hour) % 24, date: `${p.year}-${p.month}-${p.day}` }
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * Midnight on the Monday of the week containing `at`, in London.
 *
 * Done through the zone offset rather than local time so the boundary does not
 * shift by an hour twice a year and quietly drop a Sunday night's games.
 */
export function weekStart(at = new Date()): number {
  const { weekday, date } = londonParts(at)
  const back = Math.max(0, WEEKDAYS.indexOf(weekday))
  const [y, m, d] = date.split('-').map(Number)
  let guess = Date.UTC(y!, m! - 1, d!) - back * DAY
  // One correction pass is enough: the offset is only ever wrong by an hour.
  guess -= zoneOffset(new Date(guess))
  return guess
}

/** Which day of the week it is, 1 (Monday) through 7 (Sunday). */
export function dayOfWeek(at = new Date()): number {
  return Math.max(1, WEEKDAYS.indexOf(londonParts(at).weekday) + 1)
}

export function shouldRunAttendance(now = new Date()): { run: boolean; date: string } {
  const { hour, date } = londonParts(now)
  return { run: hour >= 10 && settings.get(LAST_RUN) !== date, date }
}

export async function attendanceChannel(guild: Guild): Promise<TextChannel | undefined> {
  await guild.channels.fetch()
  return guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === config.attendanceChannel,
  ) as TextChannel | undefined
}

export type PlayerWeek = {
  discordId: string
  name: string
  team: TeamKey
  games: MatchRow[]
  registered: boolean
}

/**
 * Pulls the window from Riot before counting.
 *
 * The background poll only ever asks for a player's last ten matches, so a
 * stretch with an expired key leaves gaps. Refetching by timestamp means nobody
 * gets chased for games the tracker simply missed.
 */
export async function refreshWeek(since: number): Promise<string> {
  for (const account of accounts.all()) {
    try {
      await syncAccount(account, MATCH_PAGE, since)
    } catch (err) {
      if (err instanceof KeyExpiredError) {
        return 'The Riot key has expired, so this counts only what was already tracked and may be low. Run `/setkey`.'
      }
      return 'Riot could not be reached while refreshing, so some games may be missing.'
    }
  }
  return ''
}

export async function collectWeek(guild: Guild, since: number, until = Date.now()): Promise<PlayerWeek[]> {
  const roster = [...(await rosterMembers(guild, 'a')), ...(await rosterMembers(guild, 'b'))]
  const seen = new Set<string>()
  const out: PlayerWeek[] = []

  for (const member of roster) {
    if (seen.has(member.id)) continue
    seen.add(member.id)

    const linked = accounts.forUser(member.id)
    const games = ranked(linked.flatMap((a) => matches.since(a.puuid, since))).filter(
      (g) => g.played_at < until,
    )
    out.push({
      discordId: member.id,
      name: member.displayName,
      // rosterMembers puts A Team first and the dedupe keeps the first hit, but
      // be explicit rather than relying on that ordering.
      team: teamOf(member) ?? 'a',
      games,
      registered: linked.length > 0,
    })
  }
  return out
}

export type Report = { mode: 'final' | 'pace'; day?: number; warning?: string }

export function buildAttendance(players: PlayerWeek[], report: Report) {
  const { mode, day = 7, warning = '' } = report
  const checked = players.filter((p) => p.registered)
  const unregistered = players.filter((p) => !p.registered)

  // On a pace check the bar rises through the week, so nobody is "behind" on
  // Tuesday for being at three games.
  const expected = mode === 'final' ? WEEKLY_GAME_TARGET : (WEEKLY_GAME_TARGET * day) / 7
  const daysLeft = 7 - day
  const onPace = (p: PlayerWeek) => p.games.length >= expected

  const embed = baseEmbed().setColor(checked.every(onPace) ? GREEN : checked.length ? RED : GOLD)
  const met = checked.filter(onPace).length

  if (mode === 'final') {
    embed.setTitle('Weekly games check').setDescription(
      `### ${met} of ${checked.length} hit ${WEEKLY_GAME_TARGET}+ ranked games\n` +
        'The week just gone, solo and flex combined across every linked account.' +
        (warning ? `\n-# ${warning}` : ''),
    )
  } else {
    embed.setTitle(`Weekly games check · day ${day} of 7`).setDescription(
      `### ${met} of ${checked.length} on pace for ${WEEKLY_GAME_TARGET}\n` +
        `${daysLeft === 0 ? 'Last day of the week' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}` +
        ` · pace is ${expected.toFixed(1)} games by now.` +
        (warning ? `\n-# ${warning}` : ''),
    )
  }

  const line = (p: PlayerWeek) => {
    const wins = p.games.filter((g) => g.win).length
    const need = WEEKLY_GAME_TARGET - p.games.length
    const rate = p.games.length ? ` · ${winrate(wins, p.games.length - wins)}` : ''
    const mark = onPace(p) ? '🟢' : '🔴'
    if (mode === 'final') {
      return `${mark} <@${p.discordId}> — **${p.games.length}**${need > 0 ? ` · ${need} short` : ''}${rate}`
    }
    const chase =
      need <= 0
        ? ' · done'
        : daysLeft === 0
          ? ` · needs ${need} today`
          : ` · needs ${need} in ${daysLeft}d`
    return `${mark} <@${p.discordId}> — **${p.games.length}**/${WEEKLY_GAME_TARGET}${chase}${rate}`
  }

  // One field per roster, players who are behind listed first.
  for (const team of ['a', 'b'] as TeamKey[]) {
    const squad = checked
      .filter((p) => p.team === team)
      .sort((x, y) => Number(onPace(x)) - Number(onPace(y)) || x.games.length - y.games.length)
    if (!squad.length) continue
    embed.addFields({
      name: `${TEAM_ROLE[team]} — ${squad.filter(onPace).length} of ${squad.length} ${mode === 'final' ? 'on target' : 'on pace'}`,
      value: squad.map(line).join('\n').slice(0, 1024),
    })
  }

  if (!checked.length) {
    embed.addFields({ name: 'Nobody to check', value: 'No one on a roster has linked a Riot account yet.' })
  }

  // Champion homework, only when somebody actually has some.
  const homework = checked
    .map((p) => ({ p, lines: champProgress(p.discordId, weekStart()).map(champLine) }))
    .filter((x) => x.lines.length)
    .map((x) => `<@${x.p.discordId}>\n${x.lines.map((l) => `· ${l}`).join('\n')}`)
  if (homework.length) {
    embed.addFields({ name: 'Assigned champions', value: homework.join('\n').slice(0, 1024) })
  }

  if (unregistered.length) {
    embed.addFields({
      name: 'Cannot be checked',
      value: `Not registered, so they have no games to count: ${unregistered
        .map((p) => `${p.name} (${TEAM_ROLE[p.team]})`)
        .join(', ')}`.slice(0, 1024),
    })
  }

  return { embed, behind: checked.filter((p) => !onPace(p)) }
}

export async function postAttendance(guild: Guild, now = new Date()) {
  const channel = await attendanceChannel(guild)
  if (!channel) {
    console.error(`[attendance] no #${config.attendanceChannel} channel — run "npm run setup".`)
    return
  }

  const start = weekStart(now)
  const day = dayOfWeek(now)
  // Monday morning belongs to the week that just finished, not the one an hour old.
  const mode: Report['mode'] = day === 1 ? 'final' : 'pace'
  const since = mode === 'final' ? start - WEEK : start
  const until = mode === 'final' ? start : now.getTime()

  const warning = await refreshWeek(since)
  const players = await collectWeek(guild, since, until)
  const { embed, behind } = buildAttendance(players, { mode, day, warning })

  // Only Monday's wrap-up is worth a ping. A daily nag would train you to ignore it.
  const ping = mode === 'final' && behind.length
  await channel.send({
    content: ping ? `${staffMention(guild)} — ${behind.length} missed ${WEEKLY_GAME_TARGET} last week.` : undefined,
    embeds: [embed],
  })
}

export function startAttendance(client: Client) {
  const tick = async () => {
    const { run, date } = shouldRunAttendance()
    if (!run) return
    const guild = client.guilds.cache.get(config.guildId)
    if (!guild) return
    settings.set(LAST_RUN, date)
    await postAttendance(guild).catch((err) => console.error('[attendance] failed:', err))
  }
  setInterval(tick, 60_000)
}
