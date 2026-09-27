/**
 * The #welcome message — the first thing anyone following an invite link reads.
 *
 * Channel names are resolved to real mentions at post time so every pointer in
 * here is clickable rather than something to go hunting for.
 */

import { AttachmentBuilder, ChannelType, type GuildMember, type TextChannel } from 'discord.js'
import { ROLE_NAMES } from './config.js'
import { baseEmbed, GOLD } from './format.js'

const BANNER = 'banner-welcome.png'

export function welcomeFiles() {
  return [new AttachmentBuilder(`./assets/${BANNER}`, { name: BANNER })]
}

/** `ref` turns a channel name into a mention, falling back to plain #name. */
export function welcomeEmbed(ref: (name: string) => string) {
  return baseEmbed()
    .setColor(GOLD)
    .setImage(`attachment://${BANNER}`)
    .setDescription(
      "The uni League of Legends society, plus the teams that come out of it. " +
        "Everyone's welcome — you don't need to be on a team to be here.",
    )
    .addFields(
      {
        name: '① Start here',
        value:
          `**Grab your lanes** in ${ref('get-roles')} — tap as many as you play.\n` +
          '**Link your account** with `/register riot-id:You#TAG` so your rank tracks itself.\n' +
          `**Say hi** in ${ref('general')}.`,
      },
      {
        name: '② Finding games',
        value:
          `${ref('looking-for-game')} is for duos and full fives. Lane roles are pingable, ` +
          'so just ask for the role you actually need.',
      },
      {
        name: '③ Playing for a team',
        value:
          `A Team and B Team play competitively, and trials are open to anyone. Tap ` +
          `**I'm here to trial** in ${ref('get-roles')} and have a read of ${ref('tryout-info')}.`,
      },
      {
        name: '④ The bot',
        value:
          "`/profile` for anyone's accounts and form, `/team a|b` for a whole roster, " +
          '`/pool` for champion tier lists, `/help` for the rest. ' +
          `Keep them in ${ref('bot-commands')} where you can.`,
      },
      {
        name: 'House rules',
        value:
          "Be decent to each other. Tilt happens; taking it out on people doesn't have to. " +
          'Clips and nonsense go in their own channels. ' +
          'Scrim plans, VODs and anything from a team channel stay in the server.',
      },
    )
}

/**
 * Everyone who joins gets Community and can play straight away. Bots get the
 * Bots role instead. Uni students get Member on top, from staff via /letin.
 */
export async function onJoin(member: GuildMember): Promise<void> {
  const guild = member.guild
  const want = member.user.bot ? ROLE_NAMES.bots : ROLE_NAMES.community
  const role = guild.roles.cache.find((r) => r.name === want)
  if (!role) {
    console.error(`[join] no "${want}" role — run npm run setup`)
    return
  }
  await member.roles.add(role, 'Joined the server')
  if (member.user.bot) return

  const general = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === 'general',
  ) as TextChannel | undefined
  const ref = (name: string) => guild.channels.cache.find((c) => c.name === name)?.toString() ?? `#${name}`
  await general?.send(
    `Welcome <@${member.id}> 👋 Grab your lanes in ${ref('get-roles')} and hit **Ping me for games** if you want a shout ` +
      `when an inhouse or custom is going. ${ref('inhouses')} and ${ref('custom-lobbies')} are where that happens.`,
  )
}
