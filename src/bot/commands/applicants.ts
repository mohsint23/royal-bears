import { AttachmentBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js'
import { applicantsFilename, applicantsWorkbook } from '../applicants.js'
import { refreshPlayerDatabase, visibleApplicants } from '../playerDatabase.js'
import { isStaff } from '../util.js'
import type { Command } from './types.js'

export const applicants: Command = {
  data: new SlashCommandBuilder()
    .setName('applicants')
    .setDescription('Spreadsheet of every tryout application: Discord name, IGN, ranks, op.gg, year')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(i) {
    if (!i.guild || !isStaff(i.guild.members.cache.get(i.user.id) ?? null)) {
      await i.reply({ content: 'Only staff and captains can pull the applicant list.', flags: MessageFlags.Ephemeral })
      return
    }
    await i.deferReply({ flags: MessageFlags.Ephemeral })
    await refreshPlayerDatabase(i.guild).catch((err) => console.error('[player-db] from /applicants:', err))
    const rows = await visibleApplicants(i.guild)
    const file = new AttachmentBuilder(await applicantsWorkbook(rows), { name: applicantsFilename() })
    await i.editReply({
      content: rows.length
        ? `${rows.length} application${rows.length === 1 ? '' : 's'}, freshly pulled from the tickets. #player-database is refreshed too.`
        : 'No applications yet — the sheet has just the headers.',
      files: [file],
    })
  },
}
