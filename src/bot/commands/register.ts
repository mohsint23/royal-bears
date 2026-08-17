import {
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { players } from '../db.js'
import { getAccount, KeyExpiredError } from '../riot.js'
import { baseEmbed, opggLink } from '../format.js'
import { isStaff, parseRiotId } from '../util.js'
import type { Command } from './types.js'

export const register: Command = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setDescription('Link a Riot account so the tracker can follow it')
    .addStringOption((o) =>
      o.setName('riot-id').setDescription('Your Riot ID, for example Faker#KR1').setRequired(true),
    )
    .addUserOption((o) =>
      o.setName('user').setDescription('Register someone else (staff only)').setRequired(false),
    ),

  async execute(i) {
    const target = i.options.getUser('user')
    const member = i.member && 'roles' in i.member ? i.member : null

    if (target && target.id !== i.user.id && !isStaff(member as never)) {
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

    await i.deferReply({ flags: MessageFlags.Ephemeral })

    try {
      const account = await getAccount(parsed.gameName, parsed.tagLine)
      const existing = players.byPuuid(account.puuid)
      if (existing && existing.discord_id !== who.id) {
        await i.editReply(`That Riot account is already registered to <@${existing.discord_id}>.`)
        return
      }

      players.upsert({
        discord_id: who.id,
        puuid: account.puuid,
        game_name: account.gameName,
        tag_line: account.tagLine,
      })

      await i.editReply({
        embeds: [
          baseEmbed()
            .setTitle('Registered')
            .setDescription(
              `**${account.gameName}#${account.tagLine}** is now linked to ${who}.\n` +
                `[Open on op.gg](${opggLink(account.gameName, account.tagLine)})`,
            )
            .addFields({
              name: 'What happens now',
              value: 'The tracker picks up their games on the next refresh. `/profile` works straight away.',
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
