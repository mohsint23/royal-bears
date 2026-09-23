# Royal Bears

Discord server setup and (later) the team tracker bot for the Royal Bears
university League of Legends team.

## Setting up the server

You need a Discord application to do this. It takes about five minutes, and the
same application becomes the tracker bot later, so it is not throwaway work.

### 1. Create the application

1. Go to <https://discord.com/developers/applications> and click **New Application**.
2. Name it `Royal Bears` and create it.
3. Open the **Bot** tab, click **Reset Token**, and copy the token. Treat this
   like a password — anyone with it controls the bot.

### 2. Invite it to your server

1. Open the **OAuth2** tab.
2. Under **Scopes** tick `bot`.
3. Under **Bot Permissions** tick **Administrator**.
4. Copy the generated URL at the bottom, open it, and add the bot to your server.

### 3. Move the bot's role to the top

In your server: **Server Settings → Roles**, drag the `Royal Bears` role to the
very top of the list.

Discord will not let a bot create or reorder roles that sit above its own, so
without this step the roles will be created but end up in the wrong order.

### 4. Fill in your details

```bash
cp .env.example .env
```

Put your bot token in `DISCORD_TOKEN`.

For `GUILD_ID`: in Discord go to **Settings → Advanced → Developer Mode** and
turn it on, then right-click your server name and choose **Copy Server ID**.

### 5. Run it

```bash
npm install
npm run setup
```

It prints everything it creates. Takes a few seconds.

## Changing the server later

Everything about the server's shape lives in `src/structure.ts` — role names,
colours, channels, and who can see what. Edit that file and run `npm run setup`
again.

The script only adds what is missing. It never deletes a channel or a role, so
you can re-run it safely and nothing you have said in the server is at risk. If
you want something gone, delete it in Discord yourself.

## What gets built

**Roles**, highest first: Staff, Coach, A Team, B Team, Sub, Tryout, Member,
the ten rank roles (Iron up to Challenger), the five position roles, and
`Gamers` — an opt-in ping for casual flex, Clash and ARAM lobbies.

Team roles sit above rank roles, so a player on a roster shows their team
colour while a society member shows their rank colour.

**Channels:**

```
📋 INFO          #welcome  #announcements  #get-roles
💬 SOCIETY       #general  #looking-for-game  #clips  #off-topic
                 🔊 General  🔊 Duo Queue 1  🔊 Duo Queue 2
🏆 A TEAM        #a-chat  #a-scrims  #a-vod-review  #a-champ-pool  🔊 A Team
🥈 B TEAM        #b-chat  #b-scrims  #b-vod-review  #b-champ-pool  🔊 B Team
🎯 TRYOUTS       #tryout-info  #tryout-chat  🔊 Tryout Lobby  (+ one #tryout-<name> per applicant)
📊 TRACKER       #stat-updates  #bot-commands  #player-database
🔒 STAFF         #staff-chat  #roster-planning
```

INFO, SOCIETY and TRACKER are open to everyone. The team categories are locked
to that roster plus Staff, Coach and Sub. TRYOUTS is locked to people holding
the `Tryout` role plus Staff and Coach — announce that tryouts are open in
`#announcements`, then hand out the `Tryout` role to let applicants in.

Applications are tickets. Someone with the `Tryout` role presses **Open a
tryout ticket** under the `#tryout-info` explainer and the bot opens a private
`#tryout-<name>` channel visible to them and staff (one per person), asks for peak rank, current
rank, main role and champs, secondary roles and champs, one message at a time,
then posts a summary card with **Trialling / Accept / Decline / Close** buttons.
Accept and Decline DM the applicant; Close deletes the channel and keeps the
answers in the database. `/applicants` (staff) attaches a spreadsheet of every
application — Discord name, IGN, peak rank, op.gg link, year, team, the rest,
and the tier list embedded as a picture —
built fresh from the database each time; `npm run export-applicants` writes the
same file locally. `#player-database` (TRACKER, captains and officer) is a
bot-maintained board of the same data — spreadsheet attached to the top
message, then one full card per applicant with their tier list — re-rendered
after every ticket change and on boot.

### Google Sheet mirror

The same table can live in a Google Sheet, so the link can be shared instead
of a file. The bot cannot sign in to Google, so the sheet runs a small Apps
Script that the bot POSTs to:

1. Make a Google Sheet. Extensions → Apps Script, delete the sample code, paste
   `google/applicants-sheet.gs`, set `SECRET` to the bot's
   `GOOGLE_SHEET_SECRET`, save.
2. Deploy → New deployment → type **Web app** → Execute as **Me**, Who has
   access **Anyone** → Deploy. Copy the web-app URL (ends in `/exec`).
3. Set `GOOGLE_SHEET_WEBHOOK` to that URL and `GOOGLE_SHEET_URL` to the sheet's
   share link. The board's top message then grows an "Open the Google Sheet"
   button and every refresh redraws the sheet, formatting included.

Tier-list pictures in the sheet come from the bot's own web server
(`src/bot/web.ts`), which needs a Railway public domain; the URLs carry an
unguessable token. Without a domain the Tier list column is blank. Reading typed answers needs the **Message Content
Intent** switched on under Bot → Privileged Gateway Intents in the developer
portal.

# The bot

Run it locally:

```bash
npm install
npm run bot        # or: npm run dev  (restarts when you edit a file)
```

## First run

The bot works straight away, but anything using live Riot data needs a key.

1. Go to <https://developer.riotgames.com>, sign in with your Riot account, and
   copy the **Development API Key** from the front page.
2. In Discord, run `/setkey` and paste it into the box that appears.

Development keys expire every 24 hours. When one dies the bot stops polling,
posts a notice in `#stat-updates` tagging Staff, and waits. Grab a fresh key and
run `/setkey` again — nothing else needs restarting.

Champion pools and scrims work with no key at all.

## Commands

| Command | Who | What it does |
|---|---|---|
| `/register riot-id:Name#TAG` | anyone | Links a Riot account. Run again to add another, up to five |
| `/accounts list\|main\|remove` | anyone | See linked accounts, pick a main, unlink one |
| `/profile user: [account]` | anyone | Rank, form, most-played champions, last five games. Defaults to the main account |
| `/team a\|b` | anyone | The roster at a glance, with a multi-search link |
| `/multi a\|b` | anyone | Just the op.gg multi-search link for a roster |
| `/pool upload image:` | anyone | Upload a tier list image |
| `/pool view user:` | anyone | Show a player's tier list |
| `/pool remove` | anyone | Delete one of your tier lists |
| `/pool view [user]` | anyone | Show a player's pool |
| `/scrim when: team:` | staff | Posts a scrim with In / Maybe / Out buttons |
| `/refresh` | staff | Pull everyone's latest games from Riot right now |
| `/help` | anyone | The command list, replied privately |
| `/setkey` | staff | Paste a fresh Riot key |

"Staff" means Staff, LoL Officer, either captain, Coach, or the server owner.

## Why some options are required

Discord only opens an option's picker automatically when that option is
required. A command whose options are all optional looks like it takes none —
you have to know to click for them.

So `/profile`, `/pool view` and `/accounts list` all require `user`. Picking
yourself is one click, and the alternative was a command that appeared to do
nothing until you went hunting for its options.

## Multiple accounts

A player can link up to five Riot accounts. The first becomes their **main**;
the rest are alts.

- `/team` and `/multi` use the main account, so a roster overview stays one line
  per person.
- **Rank roles come from the best account**, not the main. Someone whose smurf
  is two divisions higher is that good, and a captain wants to know.
- The weekly roundup counts games across every linked account.
- Removing a main promotes the oldest remaining account, so a player is never
  left without one.

`/profile account:` picks a specific account; leave it off for the main.

## Champion pools

Pools are tier list images, not typed lists. Make one wherever you like — most
people use a tier list maker — then `/pool upload image:` and `/pool view` hands
it back.

Add `position:` if the image only covers one role; leave it off and it stands
for the whole pool. A player can have one whole-pool image plus one per role.

Discord's attachment links are signed and expire within about a day, so storing
the URL would leave every image broken by tomorrow. The file is copied onto disk
beside the database instead — on Railway that means the mounted volume — and
re-attached each time someone views it. Uploads are capped at 8 MB, limited to
PNG, JPG, WEBP and GIF, and stored under a generated name so a hostile filename
cannot escape the folder.

## Looking at embeds before sending them

```bash
npm run preview      # http://127.0.0.1:7333
```

Renders the profile embeds against whatever is in the database, laid out the way
Discord lays them out. Embed design is fiddly — inline fields wrap, code blocks
are the only way to align columns — and this beats posting draft after draft
into the team's channels to see what a change did.

## The pinned command list

```bash
npm run post-help              # posts to #bot-commands
npm run post-help -- general   # or any other channel
```

Posts the command list and pins it. Run it again after changing commands and it
edits the existing pin rather than posting a second one, so the pin stays put
and nobody gets re-notified.

The text comes from `src/bot/help.ts`, which `/help` also uses — so the pin and
the command can never drift apart.

## What it does on its own

- **Every 30 minutes** it pulls each registered player's ranked standing and
  recent games. A tier or division change gets posted to `#stat-updates`. Plain
  LP movement is ignored, because nobody wants forty messages a day.
- **Rank roles** are kept in step with solo queue. Nobody self-assigns those.
- **Sundays at 18:00 UK time** it posts a weekly roundup: who played most, best
  winrate over five or more games, the team's most-picked champions, and where
  everyone currently sits.

## How it is put together

```
src/bot/
  index.ts        Wires everything up: commands, buttons, modals, jobs
  config.ts       Environment and the role/tier names shared with setup.ts
  db.ts           SQLite schema and every query the bot makes
  riot.ts         Riot API client: rate limiting, retries, key expiry
  ddragon.ts      Champion names and portraits from Riot's public CDN
  format.ts       Embed styling, rank maths, op.gg links
  sync.ts         Pulls a player's rank and games into the database
  util.ts         Roster lookups, staff checks, Riot ID parsing
  commands/       One file per slash command
  jobs/           The 30-minute poll and the Sunday roundup
```

Rosters are read from Discord roles rather than stored in the database, so
`A Team` and `B Team` in Discord are the only place membership is defined.

## Deploying to Railway

1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo**.
3. Add the environment variables from `.env` (`DISCORD_TOKEN`, `GUILD_ID`, and
   the rest). Do not commit `.env` — it is gitignored for a reason.
4. Add a **Volume** mounted at `/data`, then set `DATABASE_PATH=/data/royal-bears.db`.

Without the volume the database is wiped on every deploy, and everyone would
have to `/register` again.

Railway runs `npm start`, which is already pointed at the bot.

## Changing the server later

Everything about the server's shape lives in `src/structure.ts` — role names,
colours, channels, and who can see what. Edit that file and run `npm run setup`
again.

The script adds anything missing and re-applies permissions and topics to what
is already there. It never deletes a channel or a role, so re-running is safe.
Because it re-applies permissions, any overwrites you set by hand in Discord get
reset to match the blueprint — change the blueprint, not the channel.
