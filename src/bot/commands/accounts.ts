import { MessageFlags, SlashCommandBuilder } from 'discord.js'
import { QUEUE } from '../config.js'
import { accounts as store, MAX_ACCOUNTS, ranks, riotId } from '../db.js'
import { baseEmbed, opggLink, rankLabel } from '../format.js'
import { isStaff } from '../util.js'
import type { Command } from './types.js'

export const accounts: Command = {
  data: new SlashCommandBuilder()
    .setName('accounts')
    .setDescription('The Riot accounts linked to a player')
    .addSubcommand((s) =>
      s
        .setName('list')
        .setDescription('Show which accounts are linked')
        .addUserOption((o) => o.setName('user').setDescription('Whose accounts (defaults to you)')),
    )
    .addSubcommand((s) =>
      s
        .setName('main')
        .setDescription('Choose which account counts as your main')
        .addStringOption((o) =>
          o.setName('account').setDescription('Which account').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('Unlink an account')
        .addStringOption((o) =>
          o.setName('account').setDescription('Which account').setRequired(true).setAutocomplete(true),
        ),
    ),

  /** Suggests only the accounts the person running the command owns. */
  async autocomplete(i) {
    const mine = store.forUser(i.user.id)
    const typed = i.options.getFocused().toLowerCase()
    await i.respond(
      mine
        .filter((a) => riotId(a).toLowerCase().includes(typed))
        .slice(0, 25)
        .map((a) => ({ name: `${riotId(a)}${a.is_main ? ' (main)' : ''}`.slice(0, 100), value: a.puuid })),
    )
  },

  async execute(i) {
    const sub = i.options.getSubcommand()
    if (sub === 'list') return list(i)

    const puuid = i.options.getString('account', true)
    const account = store.byPuuid(puuid)

    if (!account || (account.discord_id !== i.user.id && !isStaff(i.member as never))) {
      await i.reply({ content: 'That is not one of your accounts.', flags: MessageFlags.Ephemeral })
      return
    }

    if (sub === 'main') {
      if (account.is_main) {
        await i.reply({ content: `**${riotId(account)}** is already your main.`, flags: MessageFlags.Ephemeral })
        return
      }
      store.setMain(account.discord_id, puuid)
      await i.reply({ content: `**${riotId(account)}** is now the main account.`, flags: MessageFlags.Ephemeral })
      return
    }

    store.remove(puuid)
    const left = store.forUser(account.discord_id)
    await i.reply({
      content:
        `Unlinked **${riotId(account)}**.` +
        (account.is_main && left[0] ? ` **${riotId(left[0])}** is the new main.` : '') +
        (left.length ? '' : ' No accounts are linked now — run `/register` to add one.'),
      flags: MessageFlags.Ephemeral,
    })
  },
}

async function list(i: Parameters<Command['execute']>[0]) {
  const who = i.options.getUser('user') ?? i.user
  const linked = store.forUser(who.id)

  if (!linked.length) {
    await i.reply({
      content:
        who.id === i.user.id
          ? 'You have no accounts linked. Run `/register riot-id:YourName#TAG`.'
          : `${who} has not linked a Riot account yet.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  await i.reply({
    embeds: [
      baseEmbed()
        .setAuthor({ name: `${who.displayName} — linked accounts`, iconURL: who.displayAvatarURL() })
        .setDescription(
          linked
            .map((a) => {
              const solo = ranks.get(a.puuid, QUEUE.solo)
              return (
                `${a.is_main ? '⭐' : '▫️'} **[${riotId(a)}](${opggLink(a.game_name, a.tag_line)})**\n` +
                ` ${rankLabel(solo)}`
              )
            })
            .join('\n\n'),
        )
        .setFooter({ text: `${linked.length}/${MAX_ACCOUNTS} linked · ⭐ main` }),
    ],
  })
}
