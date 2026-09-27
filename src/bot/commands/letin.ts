import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, type TextChannel } from 'discord.js'
import { ROLE_NAMES } from '../config.js'
import { isStaff } from '../util.js'
import type { Command } from './types.js'

/** Marks someone as a uni student: adds Member, which unlocks the UNIVERSITY area and tryouts. */
export const letin: Command = {
  data: new SlashCommandBuilder()
    .setName('letin')
    .setDescription('Give someone the Member role (uni student): unlocks the university channels and tryouts')
    .addUserOption((o) => o.setName('user').setDescription('Who').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(i) {
    if (!i.guild || !isStaff(i.guild.members.cache.get(i.user.id) ?? null)) {
      await i.reply({ content: 'Only staff and captains can let people in.', flags: MessageFlags.Ephemeral })
      return
    }
    const target = await i.guild.members.fetch(i.options.getUser('user', true).id).catch(() => null)
    const member = i.guild.roles.cache.find((r) => r.name === ROLE_NAMES.member)
    if (!target || !member) {
      await i.reply({ content: "Couldn't find them, or there is no Member role — run `npm run setup`.", flags: MessageFlags.Ephemeral })
      return
    }
    if (target.roles.cache.has(member.id)) {
      await i.reply({ content: `${target} is already a Member.`, flags: MessageFlags.Ephemeral })
      return
    }
    await target.roles.add(member, `Let in by ${i.user.tag}`)
    await i.reply({ content: `${target} is now a **Member** — the university channels and tryouts are open to them.`, flags: MessageFlags.Ephemeral })

    const uni = i.guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === 'uni-chat') as TextChannel | undefined
    await uni?.send(`Welcome in, ${target} 🎓`).catch(() => {})
  },
}
