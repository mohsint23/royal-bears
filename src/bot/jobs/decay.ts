/**
 * The decay check.
 *
 * Every morning, works out each Diamond+ account's decay bank from its solo
 * queue history and @s the owner in the stat channel when it is running low,
 * with how many games they need. Quiet days post nothing.
 * The ping goes to #stat-updates, which the players can read.
 */

import type { Client, Guild } from 'discord.js'
import { QUEUE, config } from '../config.js'
import { accounts, matches, ranks, riotId, settings, type Account, type RankRow } from '../db.js'
import {
  DECAY_WARN_DAYS,
  SOLO_QUEUE_ID,
  decayRule,
  decayState,
  decayWindow,
  type DecayRule,
  type DecayState,
} from '../decay.js'
import { baseEmbed, GOLD, GREEN, RED, rankLabel } from '../format.js'
import { KeyExpiredError } from '../riot.js'
import { syncAccount } from '../sync.js'
import { londonParts } from './attendance.js'
import { statChannel } from './announce.js'

const LAST_RUN = 'last_decay'

/** Riot caps a match-id request at 100, which covers a month of most people's games. */
const MATCH_PAGE = 100

export type DecayEntry = {
  account: Account
  rank: RankRow
  rule: DecayRule
  state: DecayState
}

const atRisk = (e: DecayEntry) => e.state.days <= DECAY_WARN_DAYS

/**
 * Every linked account that can decay, lowest bank first. With `refresh`, pulls
 * the decay window from Riot first, since the poll only ever fetches ten games.
 */
export async function collectDecay(refresh: boolean, now = Date.now()) {
  let warning = ''
  const out: DecayEntry[] = []

  for (const account of accounts.all()) {
    let rule = decayRule(ranks.get(account.puuid, QUEUE.solo)?.tier)
    if (!rule) continue

    if (refresh && !warning) {
      try {
        await syncAccount(account, MATCH_PAGE, now - decayWindow(rule))
      } catch (err) {
        warning =
          err instanceof KeyExpiredError
            ? 'The Riot key has expired, so this uses only games already tracked and may read low. Run `/setkey`.'
            : 'Riot could not be reached while refreshing, so some games may be missing.'
      }
    }

    // The refresh may have moved them in or out of Diamond+.
    const rank = ranks.get(account.puuid, QUEUE.solo)
    rule = decayRule(rank?.tier)
    if (!rank || !rule) continue

    const solo = matches
      .since(account.puuid, now - decayWindow(rule))
      .filter((g) => g.queue_id === SOLO_QUEUE_ID)
      .map((g) => g.played_at)
    out.push({ account, rank, rule, state: decayState(rule, solo, now) })
  }

  out.sort((a, b) => a.state.days - b.state.days)
  return { entries: out, warning }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function decayLine(e: DecayEntry): string {
  const { days, emptyAt, toSafe, toFill } = e.state
  const who = `<@${e.account.discord_id}> · **${riotId(e.account)}** · ${rankLabel(e.rank)}`
  const bank =
    days === 0
      ? '**decaying now**'
      : `${plural(days, 'day')} banked, empty <t:${Math.floor(emptyAt / 1000)}:R>`
  const games = atRisk(e)
    ? `play **${plural(toSafe, 'solo game')}** to be safe${toFill > toSafe ? `, ${toFill} to fill the bank` : ''}`
    : toFill > 0
      ? `${toFill} to fill the bank`
      : 'bank full'
  return `${days === 0 ? '🔴' : atRisk(e) ? '🟠' : '🟢'} ${who}\n  ${bank} · ${games}`
}

/** The full list for `/decay`, or only the at-risk accounts for the morning ping. */
export function buildDecay(entries: DecayEntry[], opts: { onlyAtRisk: boolean; warning?: string }) {
  const shown = opts.onlyAtRisk ? entries.filter(atRisk) : entries
  const risky = entries.filter(atRisk)

  const embed = baseEmbed()
    .setColor(risky.some((e) => e.state.days === 0) ? RED : risky.length ? GOLD : GREEN)
    .setTitle('Decay check')
    .setDescription(
      (entries.length
        ? `### ${risky.length} of ${plural(entries.length, 'account')} at ${DECAY_WARN_DAYS} days or less\n`
        : 'Nobody linked is Diamond or above, so nothing can decay.\n') +
        '-# Solo queue only. Diamond banks 7 days a game (max 28), Master+ 1 day a game (max 14). ' +
        'Worked out from match history, so it can read a little low, never high.' +
        (opts.warning ? `\n-# ${opts.warning}` : ''),
    )

  // Lines are two rows each; pack them into fields under Discord's 1024 limit.
  let chunk: string[] = []
  const flush = () => {
    if (chunk.length) embed.addFields({ name: '​', value: chunk.join('\n') })
    chunk = []
  }
  for (const line of shown.map(decayLine)) {
    if ([...chunk, line].join('\n').length > 1024) flush()
    chunk.push(line)
  }
  flush()

  return { embed, risky }
}

/**
 * Posts the at-risk list. Returns false without posting when Riot could not be
 * refreshed: stale history reads low, and pinging people who have actually
 * been playing would teach them to ignore it.
 */
export async function postDecay(guild: Guild): Promise<boolean> {
  const channel = await statChannel(guild)
  if (!channel) {
    console.error(`[decay] no #${config.statChannel} channel.`)
    return true
  }

  const { entries, warning } = await collectDecay(true)
  if (warning) {
    console.warn(`[decay] skipped: ${warning}`)
    return false
  }
  const { embed, risky } = buildDecay(entries, { onlyAtRisk: true })
  if (!risky.length) return true

  const users = [...new Set(risky.map((e) => e.account.discord_id))]
  await channel.send({
    content: `${users.map((id) => `<@${id}>`).join(' ')} — your decay bank is running low, get some solo games in.`,
    embeds: [embed],
    allowedMentions: { users },
  })
  return true
}

/** Daily from 10:00 UK. If Riot is down it tries again every half hour that day. */
export function startDecay(client: Client) {
  let lastTry = 0
  const tick = async () => {
    const { hour, date } = londonParts()
    if (hour < 10 || settings.get(LAST_RUN) === date) return
    if (Date.now() - lastTry < 30 * 60_000) return
    const guild = client.guilds.cache.get(config.guildId)
    if (!guild) return
    lastTry = Date.now()
    const done = await postDecay(guild).catch((err) => {
      console.error('[decay] failed:', err)
      return true
    })
    if (done) settings.set(LAST_RUN, date)
  }
  setInterval(tick, 60_000)
}
