/**
 * The #tryout-info messages: what a trial is, how to apply, what we look for.
 *
 * Three short embeds rather than one wall — Discord shows one card at a time
 * on a phone, and nobody reads a card that scrolls. The Open-a-ticket button
 * hangs off the last one (see tickets.ts / postTryouts.ts).
 */

import type { EmbedBuilder } from 'discord.js'
import { baseEmbed, GOLD } from './format.js'

type Ref = (name: string) => string

export function tryoutsEmbeds(ref: Ref): EmbedBuilder[] {
  return [
    baseEmbed()
      .setColor(GOLD)
      .setTitle('Trying out for a team')
      .setDescription(
        'A Team and B Team play properly; everyone else is here for fun games.\n' +
          "Trials are open to anyone — no invite, and you don't need to know anyone.",
      ),

    baseEmbed()
      .setColor(GOLD)
      .setTitle('How to apply')
      .setDescription(
        `**1.** Hit **I'm here to trial** in ${ref('get-roles')}\n` +
          '**2.** Press **📩 Open a tryout ticket** below\n' +
          '**3.** Answer six quick questions — ranks, roles, champs\n' +
          '**4.** A captain replies in your ticket within a few days',
      ),

    baseEmbed()
      .setColor(GOLD)
      .setTitle('Good to know')
      .setDescription(
        '• Rank is the least of it. We want people who talk, take feedback, and show up.\n' +
          '• Your ticket is private — just you and the captains.\n' +
          '• A no means *not this term*. Apply again next term.\n' +
          `• Run \`/register\` first and your op.gg goes on your card.`,
      ),
  ]
}
