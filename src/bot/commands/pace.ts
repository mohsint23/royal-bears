/**
 * The games check, on demand.
 *
 * Same report the bot posts each morning in #attendance, but private to whoever
 * ran it, so a captain can look mid-day without another message in the channel.
 */

import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js'
import {
  buildAttendance,
  collectWeek,
  dayOfWeek,
  refreshWeek,
  weekStart,
} from '../jobs/attendance.js'
import { isTracker } from '../util.js'
import type { Command } from './types.js'

const WEEK = 7 * 24 * 60 * 60 * 1000

export const pace: Command = {
  data: new SlashCommandBuilder()
    .setName('pace')
    .setDescription('How the rosters are tracking against their weekly games')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((o) =>
      o
        .setName('week')
        .setDescription('Which week (defaults to the one in progress)')
        .addChoices({ name: 'This week so far', value: 'now' }, { name: 'Last week, final', value: 'last' }),
    )
    .addBooleanOption((o) =>
      o
        .setName('refresh')
        .setDescription('Pull fresh games from Riot first — slower, but exact'),
    ),

  async execute(i) {
    if (!i.guild || !isTracker(i.guild.members.cache.get(i.user.id) ?? null)) {
      await i.reply({
        content: 'That one is for the captains and the officer.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }

    // Public on purpose: the report is meant to be read by the captains
    // together, not dismissed one at a time.
    await i.deferReply()

    const now = new Date()
    const start = weekStart(now)
    const last = i.options.getString('week') === 'last'

    const since = last ? start - WEEK : start
    const until = last ? start : now.getTime()
    const warning = i.options.getBoolean('refresh') ? await refreshWeek(since) : ''

    const players = await collectWeek(i.guild, since, until)
    const { embed } = buildAttendance(players, {
      mode: last ? 'final' : 'pace',
      day: dayOfWeek(now),
      warning,
    })

    await i.editReply({ embeds: [embed] })
  },
}
