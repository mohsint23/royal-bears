import {
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js'
import { players } from '../db.js'
import { KeyExpiredError } from '../riot.js'
import { syncAll, syncRankRoles } from '../sync.js'
import { isStaff } from '../util.js'
import type { Command } from './types.js'

export const refresh: Command = {
  data: new SlashCommandBuilder()
    .setName('refresh')
    .setDescription('Staff only — pull everyone’s latest games from Riot now'),

  async execute(i) {
    if (!isStaff(i.member as never)) {
      await i.reply({ content: 'Staff only.', flags: MessageFlags.Ephemeral })
      return
    }
    const count = players.all().length
    if (!count) {
      await i.reply({ content: 'Nobody has registered yet.', flags: MessageFlags.Ephemeral })
      return
    }

    await i.deferReply({ flags: MessageFlags.Ephemeral })
    try {
      const result = await syncAll()
      if (i.guild) await syncRankRoles(i.guild)
      await i.editReply(
        `Refreshed ${count} player${count === 1 ? '' : 's'} — ${result.newGames} new game${
          result.newGames === 1 ? '' : 's'
        }, ${result.changes.length} rank change${result.changes.length === 1 ? '' : 's'}.`,
      )
    } catch (err) {
      await i.editReply(
        err instanceof KeyExpiredError
          ? 'The Riot API key has expired. Run `/setkey` with a fresh one.'
          : `Refresh failed: ${(err as Error).message}`,
      )
    }
  },
}
