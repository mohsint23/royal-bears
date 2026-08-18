import {
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { QUEUE } from '../config.js'
import { accounts, matches, ranks, riotId, type Account } from '../db.js'
import { championDisplay, championIcon } from '../ddragon.js'
import { KeyExpiredError } from '../riot.js'
import { syncAccount } from '../sync.js'
import {
  baseEmbed,
  columns,
  opggLink,
  rankLabel,
  rankScore,
  rankShort,
  tierColour,
  topChampions,
  winratePct,
} from '../format.js'
import type { Command } from './types.js'

const WEEK = 7 * 24 * 60 * 60 * 1000
const STALE = 10 * 60 * 1000

export const profile: Command = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Rank, recent champions and form for a player')
    .addUserOption((o) => o.setName('user').setDescription('Which player — pick yourself for your own').setRequired(true))
    .addStringOption((o) =>
      o.setName('account').setDescription('Just one account. Leave off to see them all').setAutocomplete(true),
    ),

  async autocomplete(i) {
    // Autocomplete interactions cannot resolve a user object, only its id.
    const targetId = (i.options.get('user')?.value as string | undefined) ?? i.user.id
    const typed = i.options.getFocused().toLowerCase()
    await i.respond(
      accounts
        .forUser(targetId)
        .filter((a) => riotId(a).toLowerCase().includes(typed))
        .slice(0, 25)
        .map((a) => ({ name: `${riotId(a)}${a.is_main ? ' (main)' : ''}`.slice(0, 100), value: a.puuid })),
    )
  },

  async execute(i) {
    const who = i.options.getUser('user', true)
    const chosen = i.options.getString('account')
    const linked = accounts.forUser(who.id)

    if (!linked.length) {
      await i.reply({
        content:
          who.id === i.user.id
            ? 'You are not registered yet. Run `/register riot-id:YourName#TAG`.'
            : `${who} has not registered a Riot account yet.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Naming an account narrows to just that one; otherwise every account the
    // player has linked gets its own block.
    const player = chosen ? linked.find((a) => a.puuid === chosen) : undefined
    if (chosen && !player) {
      await i.reply({
        content: 'That account is not linked to them any more.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await i.deferReply()

    let warning = ''
    for (const account of player ? [player] : linked) {
      const solo = ranks.get(account.puuid, QUEUE.solo)
      if (solo && Date.now() - solo.updated_at <= STALE) continue
      try {
        await syncAccount(account)
      } catch (err) {
        warning =
          err instanceof KeyExpiredError
            ? '\n\n*The Riot key has expired, so this may be out of date. Staff can run `/setkey`.*'
            : '\n\n*Could not reach Riot just now, so this may be out of date.*'
        break
      }
    }

    if (player) {
      await i.editReply({ embeds: [buildProfile(who, player, linked, warning)] })
      return
    }

    // Every account gets the full treatment as its own embed. Main first, then
    // the rest by rank. The "other accounts" footer is dropped, since they are
    // all already on screen, and the warning only needs saying once.
    const ordered = [...linked].sort(
      (a, b) =>
        Number(b.is_main) - Number(a.is_main) ||
        rankScore(ranks.get(b.puuid, QUEUE.solo)) - rankScore(ranks.get(a.puuid, QUEUE.solo)),
    )

    await i.editReply({
      embeds: ordered.map((account, idx) =>
        buildProfile(who, account, linked, idx === 0 ? warning : '', false),
      ),
    })
  },
}

/**
 * The profile embed, kept separate from the command so it can be rendered and
 * looked at without posting to Discord.
 */
export function buildProfile(
  who: { id: string; displayName: string; toString(): string; displayAvatarURL(): string },
  player: Account,
  linked: Account[],
  warning = '',
  /** Off when every account is already on screen as its own embed. */
  showOthers = true,
) {
  const solo = ranks.get(player.puuid, QUEUE.solo)
  const flex = ranks.get(player.puuid, QUEUE.flex)
  const recent = matches.recent(player.puuid, 20)
  const thisWeek = matches.since(player.puuid, Date.now() - WEEK)
  const champs = topChampions(recent, 3)
  const last5 = recent.slice(0, 5)

  const embed = baseEmbed()
    .setColor(tierColour(solo?.tier))
    .setAuthor({ name: who.displayName, iconURL: who.displayAvatarURL() })
    .setTitle(riotId(player))
    .setURL(opggLink(player.game_name, player.tag_line))

  // The headline is the one line anyone actually reads.
  embed.setDescription(
    (solo?.tier
      ? `### ${rankLabel(solo)}\n${winratePct(solo.wins, solo.losses)} over ${solo.wins + solo.losses} ranked games`
      : '### Unranked\nNo solo queue games this split') +
      (player.is_main ? '' : '\n-# alt account') +
      warning,
  )

  const weekWins = thisWeek.filter((m) => m.win).length
  const last5Wins = last5.filter((m) => m.win).length

  // Three columns, each exactly two lines, so nothing wraps out of alignment.
  embed.addFields(
    {
      name: 'This week',
      value: thisWeek.length
        ? `${thisWeek.length} game${thisWeek.length === 1 ? '' : 's'}\n${winratePct(weekWins, thisWeek.length - weekWins)} · ${weekWins}W ${thisWeek.length - weekWins}L`
        : 'No games\n—',
      inline: true,
    },
    {
      name: 'Flex queue',
      value: flex?.tier ? `${rankShort(flex)}\n${winratePct(flex.wins, flex.losses)} winrate` : 'Unranked\n—',
      inline: true,
    },
  )

  // Code blocks so the columns line up — Discord's normal font is proportional.
  if (champs.length) {
    embed.setThumbnail(championIcon(champs[0]!.champion))
    embed.addFields({
      name: 'Most played',
      value:
        '```\n' +
        columns(
          [
            ['CHAMPION', 'GP', 'WR'],
            ...champs.map((c) => [
              championDisplay(c.champion),
              `${c.games}`,
              winratePct(c.wins, c.games - c.wins),
            ]),
          ],
          [14, -3, -4],
        ) +
        '\n```',
    })
  }

  if (last5.length) {
    embed.addFields({
      name: `Recent games · ${last5.map((m) => (m.win ? '🟢' : '🔴')).join('')} ${last5Wins}W ${last5.length - last5Wins}L`,
      value:
        '```\n' +
        columns(
          [
            ['', 'CHAMPION', 'K/D/A', 'KDA'],
            ...last5.map((m) => [
              m.win ? 'W' : 'L',
              championDisplay(m.champion),
              `${m.kills}/${m.deaths}/${m.assists}`,
              (m.deaths === 0 ? m.kills + m.assists : (m.kills + m.assists) / m.deaths).toFixed(1),
            ]),
          ],
          [1, 14, 9, -4],
        ) +
        '\n```',
    })
  }

  const others = showOthers ? linked.filter((a) => a.puuid !== player.puuid) : []
  if (others.length) {
    embed.addFields({
      name: 'Other accounts',
      value: others
        .map((a) => `${a.is_main ? '⭐ ' : ''}**${riotId(a)}** — ${rankLabel(ranks.get(a.puuid, QUEUE.solo))}`)
        .join('\n'),
    })
  }

  return embed
}
