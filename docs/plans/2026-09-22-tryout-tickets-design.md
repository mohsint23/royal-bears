# Tryout tickets

Replaces the forum-based application flow with a private ticket per applicant.

## Flow

1. Someone clicks **I'm here to trial** in `#get-roles`. The button handler in
   `roles.ts` already assigns the Tryout role; it now also opens a ticket. A
   `GuildMemberUpdate` listener opens one when the role is added by hand.
2. The bot creates `#tryout-<username>` under 🎯 TRYOUTS, visible only to the
   applicant plus Staff, LoL Officer, Coach, Team A Captain and Team B Captain.
   If the applicant already has an open ticket, they are pointed at it instead.
3. In the channel the bot asks six questions one at a time and waits for a
   typed reply to each:
   - Peak rank
   - Current rank
   - Main role
   - Champs for your main role
   - Secondary role(s)
   - Champs for your secondary role(s)
   Each accepted answer gets a ✅ reaction. After 24h of silence the bot posts
   one nudge and keeps waiting. Tickets never close on their own.
4. Once all six are in, the bot posts a summary card (answers plus the op.gg
   link if they have run `/register`) and pings the captains.
5. Staff-only buttons under the card: **Trialling**, **Accept**, **Decline**,
   **Close**. Trialling/Accept/Decline rename the channel to
   `#trialling-`, `#accepted-`, `#declined-<name>`. Accept and Decline DM the
   player a short message. Close saves the answers to the database and deletes
   the channel.
6. Removing the Tryout role does not touch the ticket, and closing the ticket
   does not touch the role.

## Code

- `src/bot/tickets.ts`: channel creation, question loop, summary card, staff
  buttons. Exposes `isTicketButton` / `handleTicketButton` for `index.ts`, the
  same shape as `roles.ts` and `scrim.ts`.
- `tryout_tickets` table in `db.ts`: discord_id, channel_id, six answer
  columns, status (open | trialling | accepted | declined | closed),
  created_at, closed_at. Answers are written as they arrive so a restart loses
  nothing; on boot the bot resumes every open ticket from its next unanswered
  question.
- Intents: add `GuildMessages` and `MessageContent`. Only messages inside a
  ticket channel from that ticket's owner are read.
- `structure.ts`: drop the `tryout-applications` forum. Setup never deletes,
  so the existing forum is removed from the server by hand.
- `tryouts.ts`: rewrite the `#tryout-info` embed for the ticket flow, reposted
  with `npm run post-tryouts`.

## Errors

- Channel creation failure: ephemeral reply telling the person to ping a
  captain; error logged.
- Non-staff pressing a staff button: ephemeral refusal, as `/champ` does.
- DM failure on Accept/Decline (DMs closed): note posted in the ticket instead.

## Testing

- Question sequencing and rename helpers are pure functions with a small test
  file; `npm run typecheck` stays clean.
- One local end-to-end run against the real server, then the local instance is
  stopped before `railway up`, since two instances on one token race.

## Needs from the server owner

- **Message Content Intent** enabled in the Discord Developer Portal
  (Applications → Royal Bears → Bot → Privileged Gateway Intents). Without it
  the bot receives typed replies with empty content.
