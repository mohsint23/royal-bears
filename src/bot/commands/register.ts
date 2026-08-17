import { MessageFlags, SlashCommandBuilder } from 'discord.js'
import { accounts, MAX_ACCOUNTS, riotId } from '../db.js'
import { getAccount, KeyExpiredError } from '../riot.js'
import { baseEmbed, opggLink } from '../format.js'
import { isStaff, parseRiotId } from '../util.js'
import type { Command } from './types.js'

export const register: Command = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Link a Riot account. Run it again to add a second one')
    .addStringOption((o) =>
      o.setName('riot-id').setDescription('Your Riot ID, for example Faker#KR1').setRequired(true),
    )
    .addUserOption((o) =>
      o.setName('user').setDescription('Register someone else (staff only)').setRequired(false),
    ),

  async execute(i) {
    const target = i.options.getUser('user')
    if (target && target.id !== i.user.id && !isStaff(i.member as never)) {
      await i.reply({ content: 'Only staff can register someone else.', flags: MessageFlags.Ephemeral })
      return
    }
    const who = target ?? i.user

    const parsed = parseRiotId(i.options.getString('riot-id', true))
    if (!parsed) {
      await i.reply({
        content: 'That does not look like a Riot ID. It needs the tag too, like `Faker#KR1`.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    if (accounts.countFor(who.id) >= MAX_ACCOUNTS) {
      await i.reply({
        content: `${who.id === i.user.id ? 'You have' : `${who} has`} the maximum of ${MAX_ACCOUNTS} accounts linked. Remove one with \`/accounts remove\` first.`,
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    await i.deferReply({ flags: MessageFlags.Ephemeral })

    try {
      const account = await getAccount(parsed.gameName, parsed.tagLine)
      const existing = accounts.byPuuid(account.puuid)

      if (existing && existing.discord_id !== who.id) {
        await i.editReply(`That Riot account is already linked to <@${existing.discord_id}>.`)
        return
      }
      if (existing) {
        await i.editReply(`**${riotId(existing)}** is already linked to ${who}.`)
        return
      }

      const { becameMain } = accounts.add({
        puuid: account.puuid,
        discord_id: who.id,
        game_name: account.gameName,
        tag_line: account.tagLine,
      })

      const linked = accounts.forUser(who.id)

      await i.editReply({
        embeds: [
          baseEmbed()
            .setTitle(becameMain ? 'Registered' : 'Account added')
            .setDescription(
              `**${account.gameName}#${account.tagLine}** is now linked to ${who}.\n` +
                `[Open on op.gg](${opggLink(account.gameName, account.tagLine)})`,
            )
            .addFields({
              name: becameMain ? 'What happens now' : `Your accounts (${linked.length}/${MAX_ACCOUNTS})`,
              value: becameMain
                ? 'The tracker picks up your games on the next refresh. `/profile` works straight away.\n\nAdd another account by running `/register` again.'
                : linked
                    .map((a) => `${a.is_main ? '**main**' : 'alt'} — ${riotId(a)}`)
                    .join('\n') + '\n\nChange which is your main with `/accounts main`.',
            }),
        ],
      })
    } catch (err) {
      if (err instanceof KeyExpiredError) {
        await i.editReply('The Riot API key has expired. Ask staff to run `/setkey`.')
        return
      }
      await i.editReply(
        `Could not find **${parsed.gameName}#${parsed.tagLine}**. Check the spelling and the tag after the #.`,
      )
    }
  },
}
