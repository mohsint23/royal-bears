/**
 * One definition of the command list, used by both /help and the pinned
 * message in the tracker channel, so the two can never disagree.
 */

import { baseEmbed, GOLD } from './format.js'

const EVERYONE = [
  ['/register `riot-id:`', 'Link a Riot account. Do this first. Run it again to add a second account — up to five.'],
  ['/accounts list `[user]`', 'See which accounts are linked and which is the main.'],
  ['/accounts main `account:`', 'Choose which account counts as your main.'],
  ['/accounts remove `account:`', 'Unlink an account.'],
  ['/profile `[user]` `[account]`', 'Rank, form this week, most-played champions, last five games. Defaults to the main account.'],
  ['/team `a|b`', 'A whole roster at a glance, with a multi-search link.'],
  ['/multi `a|b`', 'Just the op.gg multi-search link for a roster.'],
  ['/pool edit `position:`', 'Grade your champions for a role: S, A, B, Willing to learn, Can’t play. Paste comma-separated lists — whatever is left in the boxes becomes your pool.'],
  ['/pool view `[user]`', "Show someone's pool."],
  ['/help', 'This message.'],
] as const

const STAFF = [
  ['/scrim `when:` `team:` `[opponent:]`', 'Post a scrim with In / Maybe / Out buttons.'],
  ['/refresh', "Pull everyone's latest games from Riot right now."],
  ['/setkey', 'Paste a fresh Riot API key when the old one expires.'],
] as const

const list = (rows: readonly (readonly [string, string])[]) =>
  rows.map(([cmd, what]) => `**${cmd}**\n${what}`).join('\n\n')

export function helpEmbed() {
  return baseEmbed()
    .setColor(GOLD)
    .setTitle('Royal Bears bot — what you can do')
    .setDescription(
      'Type `/` in any channel and Discord will suggest these as you go. ' +
        'Most replies are only visible to you.',
    )
    .addFields(
      { name: 'Everyone', value: list(EVERYONE) },
      { name: 'Staff and captains', value: list(STAFF) },
      {
        name: 'Smurfs and second accounts',
        value:
          'Link as many as five. The **main** is what `/team` and `/multi` use, and your rank role comes ' +
          'from your best account, not just the main one.',
      },
      {
        name: 'If the tracker goes quiet',
        value:
          'Riot keys expire every 24 hours. When one dies the bot says so here and pauses. ' +
          'A staff member runs `/setkey` with a fresh one and it picks straight back up.',
      },
    )
}
