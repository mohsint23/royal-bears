/**
 * The self-assign roles that live in #get-roles.
 *
 * One message, one row of lane buttons plus a tryout opt-in. Every button
 * toggles, so the same tap both adds and removes and nobody has to read an
 * instruction to work it out.
 *
 * The message is defined here rather than in the posting script so the bot and
 * the script can never drift apart on what the buttons are called.
 */

import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type Role,
} from 'discord.js'
import { POSITIONS, type Position } from './config.js'
import { baseEmbed, GOLD } from './format.js'
import { openTicket } from './tickets.js'

const PREFIX = 'role:'
const CLEAR = 'role:__clear'
const TRYOUT = 'role:__tryout'
const TRYOUT_ROLE = 'Tryout'
const BANNER = 'banner-roles.png'

/** Purely decorative, but it makes the row scannable at a glance. */
const EMOJI: Record<Position, string> = {
  Top: '⬆️',
  Jungle: '🌿',
  Mid: '✳️',
  ADC: '🏹',
  Support: '🛡️',
}

export const isRoleButton = (customId: string) => customId.startsWith(PREFIX)

export function roleButtons() {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      ...POSITIONS.map((position) =>
        new ButtonBuilder()
          .setCustomId(`${PREFIX}${position}`)
          .setLabel(position)
          .setEmoji(EMOJI[position])
          .setStyle(ButtonStyle.Secondary),
      ),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(TRYOUT)
        .setLabel("I'm here to trial")
        .setEmoji('🎯')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(CLEAR)
        .setLabel('Clear my lanes')
        .setEmoji('🧹')
        .setStyle(ButtonStyle.Secondary),
    ),
  ]
}

/** The header art. Re-sent on every edit, since editing replaces attachments. */
export function roleFiles() {
  return [new AttachmentBuilder(`./assets/${BANNER}`, { name: BANNER })]
}

/** `ref` turns a channel name into a mention, falling back to plain #name. */
export function rolesEmbed(ref: (name: string) => string) {
  return baseEmbed()
    .setColor(GOLD)
    .setImage(`attachment://${BANNER}`)
    .setDescription(
      "**Tap the lanes you play.** Tap one again to take it off — same button does both.\n" +
        "They're just tags, so captains can ping the right people when a game needs a fifth.",
    )
    .addFields(
      {
        name: 'Play more than one lane?',
        value: "Pick them all. There's no limit, and no downside to being honest about a fill.",
      },
      {
        name: '🎯 Here to trial?',
        value:
          `Hit **I'm here to trial** and you're in — it gets you the Tryout role, opens ` +
          `${ref('tryout-chat')} and the Tryout Lobby, and the bot opens a private ticket where it ` +
          `asks you a few questions. Read ${ref('tryout-info')} first. Changed your mind? Tap it again.`,
      },
      {
        name: 'Rank roles sort themselves out',
        value:
          'Run `/register riot-id:You#TAG` once. You get Iron through Challenger off your best ' +
          'account and the bot keeps it current — nothing to pick here.',
      },
    )
}

/** Everything a member can hand themselves from this message. */
function selfAssignable(guild: Guild): Role[] {
  return [...POSITIONS, TRYOUT_ROLE]
    .map((name) => guild.roles.cache.find((r) => r.name === name))
    .filter((r): r is Role => Boolean(r))
}

/**
 * A bot cannot touch a role sitting above its own, and the error Discord
 * returns for that is not something a player could act on.
 */
function canManage(guild: Guild, role: Role): boolean {
  const me = guild.members.me
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return false
  return role.position < me.roles.highest.position
}

function lanesHeld(guild: Guild, member: GuildMember): string[] {
  return POSITIONS.filter((p) => {
    const role = guild.roles.cache.find((r) => r.name === p)
    return role && member.roles.cache.has(role.id)
  })
}

export async function handleRoleButton(i: ButtonInteraction) {
  const member = i.guild?.members.cache.get(i.user.id) ?? (await i.guild?.members.fetch(i.user.id))
  if (!i.guild || !member) {
    await i.reply({ content: 'That only works inside the server.', flags: MessageFlags.Ephemeral })
    return
  }
  const guild = i.guild

  if (i.customId === CLEAR) {
    const held = POSITIONS.map((p) => guild.roles.cache.find((r) => r.name === p)).filter(
      (r): r is Role => Boolean(r) && member.roles.cache.has(r!.id),
    )
    if (!held.length) {
      await i.reply({ content: 'You had no lanes set.', flags: MessageFlags.Ephemeral })
      return
    }
    await member.roles.remove(held, 'Cleared lane roles')
    await i.reply({
      content: `Cleared ${held.map((r) => `**${r.name}**`).join(', ')}.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const wanted = i.customId === TRYOUT ? TRYOUT_ROLE : i.customId.slice(PREFIX.length)
  const role = selfAssignable(guild).find((r) => r.name === wanted)

  if (!role) {
    await i.reply({
      content: `There's no **${wanted}** role here. Staff can run \`npm run setup\` to make it.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }
  if (!canManage(guild, role)) {
    await i.reply({
      content: `I can't hand out **${wanted}** — staff need to drag my role above it in Server Settings.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  const had = member.roles.cache.has(role.id)
  if (had) await member.roles.remove(role, 'Self-assigned from #get-roles')
  else await member.roles.add(role, 'Self-assigned from #get-roles')

  if (i.customId === TRYOUT) {
    if (had) {
      await i.reply({
        content: 'Taken **Tryout** back off. No hard feelings — grab it again whenever.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }
    // Making the channel takes a moment; defer so the button does not time out.
    await i.deferReply({ flags: MessageFlags.Ephemeral })
    try {
      const { channel, created } = await openTicket(guild, member)
      await i.editReply({
        content: created
          ? `You're down as trialling. Your tryout ticket is open: ${channel} — answer the questions there when you're ready.`
          : `**Tryout** is yours again. Your ticket is still open: ${channel}.`,
      })
    } catch (err) {
      console.error('[tickets] open from button:', err)
      await i.editReply({
        content: "Got you the **Tryout** role, but I couldn't open your ticket — ping a captain and they'll sort it.",
      })
    }
    return
  }

  const lanes = lanesHeld(guild, member)
  await i.reply({
    content:
      `${had ? 'Dropped' : 'Added'} **${wanted}**.\n` +
      (lanes.length ? `You're down for: ${lanes.join(', ')}.` : "You've got no lanes set now."),
    flags: MessageFlags.Ephemeral,
  })
}
