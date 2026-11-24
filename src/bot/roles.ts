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
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type Role,
} from 'discord.js'
import { POSITIONS, type Position } from './config.js'
import { GOLD } from './format.js'
import { GAMES } from './games.js'

const PREFIX = 'role:'
const CLEAR = 'role:__clear'
const TRYOUT = 'role:__tryout'
const TRYOUT_ROLE = 'Tryout'
const MEMBER_ROLE = 'Member'
const GAME = 'role:__game:'
const INHOUSES = 'role:__inhouses'
const INHOUSES_ROLE = 'Inhouses'
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

const button = (id: string, label: string, emoji: string, style = ButtonStyle.Secondary) =>
  new ButtonBuilder().setCustomId(id).setLabel(label).setEmoji(emoji).setStyle(style)

const row = (...buttons: ButtonBuilder[]) => new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)

/** A plain gold card: no footer or timestamp, since four of them sit stacked. */
const card = (title: string, description: string) =>
  new EmbedBuilder().setColor(GOLD).setTitle(title).setDescription(description)

/**
 * #get-roles as four messages, one per kind of role, in this order. Kept in one
 * list so `npm run post-roles` can edit them in place without ever drifting
 * from the buttons the bot listens for.
 *
 * `ref` turns a channel name into a mention, falling back to plain #name.
 */
export function roleMessages(ref: (name: string) => string) {
  const lanes = card(
    '🧭 Your lanes',
    "**Tap the lanes you play.** Tap one again to take it off.\n" +
      "They're just tags, so captains can ping the right people when a game needs a fifth.",
  )
    .setImage(`attachment://${BANNER}`)
    .addFields(
      { name: 'Play more than one lane?', value: "Pick them all. There's no limit, and no downside to being honest about a fill." },
      {
        name: 'Rank roles sort themselves out',
        value: 'Run `/register riot-id:You#TAG` once. You get Iron through Challenger off your best account and the bot keeps it current.',
      },
    )

  const games = card(
    '🎮 Game roles',
    'Tap a game to get pinged when people want to play. Tap it again to leave.\n\n' +
      'Want a game? @ the role, like @Valorant, in any chat.',
  )

  const inhouses = card(
    '🏠 Inhouses and customs',
    `Tap **Inhouses** to open ${ref('inhouses')} and ${ref('custom-lobbies')} plus their voice channels. ` +
      '@Inhouses is the ping when a lobby needs bodies. Tap again to leave.',
  )

  const tryouts = card(
    '🎯 Tryouts (uni students)',
    `Tap **I'm here to trial** to get the Tryout role, which opens the Tryout Lobby. ` +
      `Then open your ticket from ${ref('tryout-info')}. Changed your mind? Tap it again.\n\n` +
      'Needs the Member role. Ask staff if you are a student without it.',
  )

  return [
    {
      embeds: [lanes],
      files: [new AttachmentBuilder(`./assets/${BANNER}`, { name: BANNER })],
      components: [
        row(...POSITIONS.map((p) => button(`${PREFIX}${p}`, p, EMOJI[p]))),
        row(button(CLEAR, 'Clear my lanes', '🧹')),
      ],
    },
    { embeds: [games], components: [row(...GAMES.map((g) => button(`${GAME}${g.key}`, g.role, g.emoji)))] },
    { embeds: [inhouses], components: [row(button(INHOUSES, 'Inhouses', '🎮', ButtonStyle.Primary))] },
    { embeds: [tryouts], components: [row(button(TRYOUT, "I'm here to trial", '🎯', ButtonStyle.Success))] },
  ]
}

/** Everything a member can hand themselves from #get-roles. */
function selfAssignable(guild: Guild): Role[] {
  return [...POSITIONS, TRYOUT_ROLE, INHOUSES_ROLE, ...GAMES.map((g) => g.role)]
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

  const wanted =
    i.customId === TRYOUT ? TRYOUT_ROLE
    : i.customId.startsWith(GAME) ? (GAMES.find((g) => `${GAME}${g.key}` === i.customId)?.role ?? '')
    : i.customId === INHOUSES ? INHOUSES_ROLE
    : i.customId.slice(PREFIX.length)
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

  if (i.customId === INHOUSES) {
    const ch = guild.channels.cache.find((c) => c.name === 'inhouses')
    await i.reply({
      content: had
        ? 'Dropped **Inhouses** — the inhouse channels are hidden again.'
        : `You're in. ${ch ?? '#inhouses'} and the lobby voice channels are open to you now.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (i.customId.startsWith(GAME)) {
    await i.reply({
      content: had
        ? `Dropped **${wanted}**. No more ${wanted} pings.`
        : `You've got **${wanted}**. You'll get pinged when someone wants a game, and you can call one by @-ing the role.`,
      flags: MessageFlags.Ephemeral,
    })
    return
  }

  if (i.customId === TRYOUT) {
    if (!had && !member.roles.cache.some((r) => r.name === MEMBER_ROLE)) {
      await member.roles.remove(role, 'Not a uni member').catch(() => {})
      await i.reply({
        content:
          'Tryouts are for the uni teams, so they need the **Member** role. If you are a student here, ' +
          'ask a staff member to `/letin` you and try again.',
        flags: MessageFlags.Ephemeral,
      })
      return
    }
    const info = guild.channels.cache.find((c) => c.name === 'tryout-info')
    await i.reply({
      content: had
        ? 'Taken **Tryout** back off. No hard feelings — grab it again whenever.'
        : `You're down as trialling. **Tryout** is yours — head to ${info ?? '#tryout-info'} and hit ` +
          '**Open a tryout ticket** when you are ready.',
      flags: MessageFlags.Ephemeral,
    })
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
