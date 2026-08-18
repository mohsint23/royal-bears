/**
 * The #welcome message — the first thing anyone following an invite link reads.
 *
 * Channel names are resolved to real mentions at post time so every pointer in
 * here is clickable rather than something to go hunting for.
 */

import { AttachmentBuilder } from 'discord.js'
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
