import { SlashCommandBuilder } from 'discord.js'
import { QUEUE } from '../config.js'
import { accounts, matches, ranks, riotId, type Account } from '../db.js'
import { championDisplay, championIcon } from '../ddragon.js'
import { KeyExpiredError } from '../riot.js'
import { syncAccount } from '../sync.js'
import {
  baseEmbed,
  columns,
  formSquares,
  opggLink,
  opggMultiLink,
  rankLabel,
  rankScore,
  tierColour,
  topChampions,
  winratePct,
} from '../format.js'
import { rosterMembers, TEAM_ROLE, type TeamKey } from '../util.js'
import type { Command } from './types.js'

const WEEK = 7 * 24 * 60 * 60 * 1000
const STALE = 10 * 60 * 1000

export const team: Command = {
  data: new SlashCommandBuilder()
    .setName('team')
    .setDescription('Every player on a roster, in the same detail as /profile')
    .addStringOption((o) =>
      o
        .setName('team')
        .setDescription('Which roster')
        .setRequired(true)
        .addChoices({ name: 'A Team', value: 'a' }, { name: 'B Team', value: 'b' }),
    ),

  async execute(i) {
    if (!i.guild) return
    await i.deferReply()

    const key = i.options.getString('team', true) as TeamKey
    const roster = await rosterMembers(i.guild, key)

    if (!roster.length) {
      await i.editReply(`Nobody has the **${TEAM_ROLE[key]}** role yet.`)
      return
    }

    const players: Player[] = []
    const missing: string[] = []

    for (const member of roster) {
      const linked = accounts.forUser(member.id)
      if (linked.length) players.push({ name: member.displayName, accounts: linked })
      else missing.push(member.displayName)
    }

    // Same freshness rule as /profile, applied to every account on the roster.
    // One failure stops the rest: if the key is dead it is dead for everybody.
    let warning = ''
    for (const account of players.flatMap((p) => p.accounts)) {
      const solo = ranks.get(account.puuid, QUEUE.solo)
      if (solo && Date.now() - solo.updated_at <= STALE) continue
      try {
        await syncAccount(account)
      } catch (err) {
        warning =
          err instanceof KeyExpiredError
            ? '\n-# The Riot key has expired, so some of this is out of date. Staff can run `/setkey`.'
            : '\n-# Could not reach Riot just now, so some of this may be out of date.'
        break
      }
    }

    await i.editReply({ embeds: [buildTeam(TEAM_ROLE[key], players, missing, warning)] })
  },
}

export type Player = { name: string; accounts: Account[] }

type Entry = {
  player: string
  account: Account
  score: number
  field: { name: string; value: string }
}

/** Discord caps an embed at 25 fields; the summary ones below need two. */
const MAX_ACCOUNT_FIELDS = 23

/**
 * The roster embed. Split out from the command the same way buildProfile is, so
 * it can be rendered and looked at without posting to Discord.
 *
 * Every linked account gets its own block rather than being folded into the
 * player's main, because a smurf on a different rank is the thing a captain
 * most wants to see.
 */
export function buildTeam(title: string, players: Player[], missing: string[] = [], warning = '') {
  const grouped = players.map((player) => {
    const entries: Entry[] = player.accounts.map((account) => ({
      player: player.name,
      account,
      score: rankScore(ranks.get(account.puuid, QUEUE.solo)),
      field: accountField(player.name, account),
    }))
    // Main first, then the rest by rank, so the account that counts leads.
    entries.sort((a, b) => Number(b.account.is_main) - Number(a.account.is_main) || b.score - a.score)
    return { best: Math.max(...entries.map((e) => e.score)), entries }
  })

  // Strongest player first, which is the order anyone reading a roster expects.
  grouped.sort((a, b) => b.best - a.best)
  const entries = grouped.flatMap((g) => g.entries)

  const allAccounts = players.flatMap((p) => p.accounts)
  const weekGames = allAccounts.flatMap((a) => matches.since(a.puuid, Date.now() - WEEK))
  const weekWins = weekGames.filter((m) => m.win).length
  const best = entries[0] ? ranks.get(entries[0].account.puuid, QUEUE.solo) : undefined
  const teamChamps = topChampions(
    allAccounts.flatMap((a) => matches.recent(a.puuid, 20)),
    1,
  )

  const embed = baseEmbed().setColor(tierColour(best?.tier)).setTitle(title)

  const alts = allAccounts.length - players.length
  embed.setDescription(
    (players.length
      ? `### ${players.length} registered · ${weekGames.length} game${weekGames.length === 1 ? '' : 's'} this week\n` +
        (alts ? `${allAccounts.length} accounts, ${alts} of them alts · ` : '') +
        (weekGames.length
          ? `${winratePct(weekWins, weekGames.length - weekWins)} between them · ${weekWins}W ${weekGames.length - weekWins}L`
          : 'Nobody has played a tracked game in the last seven days')
      : '### Nobody registered\nPlayers link an account with `/register riot-id:Name#TAG`') + warning,
  )

  if (teamChamps.length) embed.setThumbnail(championIcon(teamChamps[0]!.champion))

  for (const entry of entries.slice(0, MAX_ACCOUNT_FIELDS)) embed.addFields(entry.field)

  const hidden = entries.length - MAX_ACCOUNT_FIELDS
  if (hidden > 0) {
    embed.addFields({
      name: 'Too many accounts to show',
      value: `${hidden} more not listed. Use \`/profile\` for those players.`,
    })
  }

  // Mains only: a multi-search of everyone's smurfs is not a lobby anyone plays.
  const mains = allAccounts.filter((a) => a.is_main)
  if (mains.length) {
    embed.addFields({
      name: 'Multi-search',
      value: `[Open all ${mains.length} mains on op.gg](${opggMultiLink(mains)})`,
    })
  }
  if (missing.length) {
    embed.addFields({ name: 'Not registered', value: missing.join(', ').slice(0, 1024) })
  }

  return embed
}

/** One account, laid out like a compressed /profile. */
function accountField(player: string, account: Account) {
  const solo = ranks.get(account.puuid, QUEUE.solo)
  const recent = matches.recent(account.puuid, 20)
  const week = matches.since(account.puuid, Date.now() - WEEK)
  const champs = topChampions(recent, 2)

  const weekWins = week.filter((m) => m.win).length
  const form = formSquares(recent)

  // Whose account this is sits directly under the heading, not at the bottom of
  // the block, where it would read as belonging to whoever comes next.
  const lines = [
    `-# ${player} · ${account.is_main ? 'main' : 'alt'} · [op.gg](${opggLink(account.game_name, account.tag_line)})`,
    form +
      (week.length
        ? ` · ${week.length} this week, ${winratePct(weekWins, week.length - weekWins)}`
        : ' · nothing this week'),
  ]

  // Code block so the champion columns line up, exactly as /profile does it.
  if (champs.length) {
    lines.push(
      '```\n' +
        columns(
          [
            ['CHAMPION', 'GP', 'WR'],
            ...champs.map((c) => [championDisplay(c.champion), `${c.games}`, winratePct(c.wins, c.games - c.wins)]),
          ],
          [14, -3, -4],
        ) +
        '\n```',
    )
  }

  return {
    name: `${account.is_main ? '' : '↳ '}${riotId(account)} — ${rankLabel(solo)}`.slice(0, 256),
    value: lines.join('\n').slice(0, 1024),
  }
}
