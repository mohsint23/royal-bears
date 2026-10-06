/**
 * The server ladder.
 *
 * One row per player rather than per account: somebody with three smurfs should
 * not take the top three places. A player's place comes from their best
 * account — the same one their rank role is based on — while the weekly figures
 * add every account they have linked together.
 *
 * Everything is read out of the database. The poll already refreshes ranks every
 * half hour, and a command anyone can run that called Riot once per account
 * would spend the whole daily key allowance on whoever ran it most.
 */

import { SlashCommandBuilder, type Guild } from 'discord.js'
import { QUEUE, RANKED_QUEUE_IDS, WEEKLY_GAME_TARGET } from '../config.js'
import { accounts, matches, ranks, riotId, type Account } from '../db.js'
import {
  baseEmbed,
  GOLD,
  rankLabel,
  rankScore,
  tierColour,
  winratePct,
} from '../format.js'
import { weekStart } from '../jobs/attendance.js'
import { MIN_WINRATE_GAMES, placeEntries, SORTS, type Entry, type SortKey } from '../ladder.js'
import { rosterMembers, TEAM_CHOICES, TEAM_ROLE, type TeamKey } from '../util.js'
import type { Command } from './types.js'

/** Ten lines nowhere near Discord's 1024 characters per field. */
const PER_FIELD = 10

/** Past this the thing stops being a leaderboard and becomes a phone book. */
const MAX_SHOWN = 30

export const leaderboard: Command = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('The ladder — everyone registered, ranked by their best account')
    .addStringOption((o) =>
      o
        .setName('sort')
        .setDescription('What to order by (defaults to rank)')
        .addChoices(...Object.entries(SORTS).map(([value, name]) => ({ name, value }))),
    )
    .addStringOption((o) =>
      o
        .setName('team')
        .setDescription('Narrow it to one roster (defaults to everybody)')
        .addChoices(...TEAM_CHOICES),
    ),

  async execute(i) {
    if (!i.guild) return
    // Public on purpose: a leaderboard only one person can see is a DM.
    await i.deferReply()

    const sort = (i.options.getString('sort') ?? 'rank') as SortKey
    const key = i.options.getString('team') as TeamKey | null

    const { players, missing } = key ? await rosterPlayers(i.guild, key) : await allPlayers(i.guild)

    await i.editReply({
      embeds: [
        buildLeaderboard(key ? `${TEAM_ROLE[key]} ladder` : 'Royal Bears ladder', players, {
          sort,
          since: weekStart(),
          missing,
        }),
      ],
    })
  },
}

export type Player = { discordId: string; name: string; accounts: Account[] }

/** One roster, plus whoever on it still has not registered. */
async function rosterPlayers(guild: Guild, key: TeamKey) {
  const players: Player[] = []
  const missing: string[] = []

  for (const member of await rosterMembers(guild, key)) {
    const linked = accounts.forUser(member.id)
    if (linked.length) players.push({ discordId: member.id, name: member.displayName, accounts: linked })
    else missing.push(member.displayName)
  }
  return { players, missing }
}

/** Everyone with an account linked. Rosters do not come into it. */
async function allPlayers(guild: Guild) {
  if (guild.members.cache.size < guild.memberCount) await guild.members.fetch()

  const players: Player[] = []
  for (const id of accounts.userIds()) {
    const member = guild.members.cache.get(id)
    // Somebody who has left the server is not on its ladder any more.
    if (!member) continue
    players.push({ discordId: id, name: member.displayName, accounts: accounts.forUser(id) })
  }
  return { players, missing: [] as string[] }
}

/**
 * The ladder embed. Split out from the command the same way buildTeam is, so the
 * layout can be looked at in `npm run preview` without posting to Discord.
 */
export function buildLeaderboard(
  title: string,
  players: Player[],
  options: { sort: SortKey; since: number; missing?: string[]; warning?: string },
) {
  const { sort, since, missing = [], warning = '' } = options
  const entries = players.map((player) => entryFor(player, since))
  const { placed, unplaced } = placeEntries(entries, sort)
  // The leader's tier colours the whole thing; gold when there is no leader.
  const top = placed[0]
  const embed = baseEmbed().setColor(top ? tierColour(top.rank?.tier) : GOLD).setTitle(title)

  if (!entries.length) {
    embed.setDescription(
      '### Nobody to rank\nPlayers join the ladder by linking an account with `/register riot-id:Name#TAG`.',
    )
    if (missing.length) embed.addFields(notRegistered(missing))
    return embed
  }

  // Just the headline: the player count, the ordering and the week's totals were
  // all visible in the table underneath, and the line read as clutter.
  embed.setDescription(
    `### ${headline(placed, sort)}` + freshness(entries) + (warning ? `\n-# ${warning}` : ''),
  )

  const shown = placed.slice(0, MAX_SHOWN)
  for (let n = 0; n < shown.length; n += PER_FIELD) {
    const chunk = shown.slice(n, n + PER_FIELD)
    embed.addFields({
      name: n === 0 ? 'Top of the table' : `Places ${n + 1}–${n + chunk.length}`,
      value: chunk
        .map((e, k) => line(e, n + k, sort))
        .join('\n')
        .slice(0, 1024),
    })
  }

  const hidden = placed.length - shown.length
  if (hidden > 0) {
    embed.addFields({
      name: 'Further down',
      value: `${hidden} more player${hidden === 1 ? '' : 's'} not listed. Narrow it with \`team:\`.`,
    })
  }

  if (unplaced.length) {
    embed.addFields({
      name: `Fewer than ${MIN_WINRATE_GAMES} games this week`,
      value: `Listed but not placed, because a win rate off two games says nothing: ${unplaced
        .map((e) => `**${e.name}** ${e.games.length}`)
        .join(' · ')}`.slice(0, 1024),
    })
  }

  if (missing.length) embed.addFields(notRegistered(missing))
  return embed
}

/** A player's row: their best account, and this week across all of them. */
function entryFor(player: Player, since: number): Entry {
  const ranked = player.accounts
    .map((account) => {
      const rank = ranks.get(account.puuid, QUEUE.solo)
      return { account, rank, score: rankScore(rank) }
    })
    // Best account first; the main wins a tie, which is what happens when
    // nobody has played ranked yet and every score is -1.
    .sort((a, b) => b.score - a.score || Number(b.account.is_main) - Number(a.account.is_main))

  const best = ranked[0]!
  const games = player.accounts
    .flatMap((a) => matches.since(a.puuid, since))
    .filter((m) => RANKED_QUEUE_IDS.includes(m.queue_id))

  return {
    name: player.name,
    account: best.account,
    rank: best.rank,
    score: best.score,
    games,
    wins: games.filter((g) => g.win).length,
  }
}

const MEDALS = ['🥇', '🥈', '🥉']
const medal = (n: number) => MEDALS[n] ?? `${n + 1}.`

/**
 * One line per player, with whatever was sorted on in bold. Names are plain text
 * rather than mentions: a leaderboard that pings fifteen people every time
 * somebody runs it gets muted within a day.
 */
function line(e: Entry, n: number, sort: SortKey): string {
  const rank = rankLabel(e.rank)
  const rate = winratePct(e.wins, e.games.length - e.wins)

  if (sort === 'games') {
    // No games means no win rate, and ", —" reads like something went wrong.
    return `${medal(n)} **${e.name}** — **${e.games.length}**/${WEEKLY_GAME_TARGET} games${
      e.games.length ? `, ${rate}` : ''
    } — ${rank}`
  }
  if (sort === 'winrate') {
    return `${medal(n)} **${e.name}** — **${rate}** from ${e.games.length} games — ${rank}`
  }

  // Which account the place came from only matters here, where it is the thing
  // being ranked, and only when it is not the one everybody knows them by.
  const alt = e.account.is_main ? '' : ` *(${riotId(e.account)})*`
  const week = e.games.length ? `${e.games.length} game${e.games.length === 1 ? '' : 's'}, ${rate}` : 'nothing this week'
  return `${medal(n)} **${e.name}** — **${rank}**${alt} — ${week}`
}

function headline(placed: Entry[], sort: SortKey): string {
  const top = placed[0]
  if (!top) return `Nobody has ${MIN_WINRATE_GAMES} games this week yet`
  if (sort === 'games') {
    return top.games.length
      ? `${top.name} leads with ${top.games.length} game${top.games.length === 1 ? '' : 's'} this week`
      : 'Nobody has played a ranked game this week'
  }
  if (sort === 'winrate') return `${top.name} leads on ${winratePct(top.wins, top.games.length - top.wins)} this week`
  return top.rank?.tier ? `${top.name} tops the ladder on ${rankLabel(top.rank)}` : 'Nobody is ranked yet'
}

/** How old the figures are, since the poll is what keeps them current. */
function freshness(entries: Entry[]): string {
  const stamps = entries.map((e) => e.rank?.updated_at ?? 0).filter(Boolean)
  if (!stamps.length) return ''

  const mins = Math.round((Date.now() - Math.max(...stamps)) / 60_000)
  if (mins < 2) return '\n-# Ranks checked just now.'
  if (mins < 120) return `\n-# Ranks last checked ${mins} min ago.${mins > 60 ? ' Staff can run `/refresh`.' : ''}`

  const hours = Math.round(mins / 60)
  return `\n-# Ranks last checked ${hours} hour${hours === 1 ? '' : 's'} ago — staff can run \`/refresh\`.`
}

function notRegistered(missing: string[]) {
  return {
    name: 'Not on the ladder',
    value: `No linked account, so nothing to rank: ${missing.join(', ')}`.slice(0, 1024),
  }
}
