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
the ten rank roles (Iron up to Challenger), and the five position roles.

Team roles sit above rank roles, so a player on a roster shows their team
colour while a society member shows their rank colour.

**Channels:**

```
📋 INFO          #welcome  #announcements  #get-roles
💬 SOCIETY       #general  #looking-for-game  #clips  #off-topic
                 🔊 General  🔊 Duo Queue 1  🔊 Duo Queue 2
🏆 A TEAM        #a-chat  #a-scrims  #a-vod-review  #a-champ-pool  🔊 A Team
🥈 B TEAM        #b-chat  #b-scrims  #b-vod-review  #b-champ-pool  🔊 B Team
🎯 TRYOUTS       #tryout-info  #tryout-applications  #tryout-chat  🔊 Tryout Lobby
📊 TRACKER       #stat-updates  #bot-commands
🔒 STAFF         #staff-chat  #roster-planning
```

INFO, SOCIETY and TRACKER are open to everyone. The team categories are locked
to that roster plus Staff, Coach and Sub. TRYOUTS is locked to people holding
the `Tryout` role plus Staff and Coach — announce that tryouts are open in
`#announcements`, then hand out the `Tryout` role to let applicants in.

`#tryout-applications` is a forum channel, so each applicant gets their own
thread to post their op.gg and availability in, and you can discuss each one
separately.

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
| `/register riot-id:Name#TAG` | anyone | Links a Riot account. Staff can pass `user:` to register someone else |
| `/profile [user]` | anyone | Rank, form, most-played champions, last five games, op.gg link |
| `/team a\|b` | anyone | The roster at a glance, with a multi-search link |
| `/multi a\|b` | anyone | Just the op.gg multi-search link for a roster |
| `/pool edit `position:`` | anyone | Grade a role's champions S to Can't play |
| `/pool view [user]` | anyone | Show a player's pool |
| `/pool gaps a\|b` | anyone | Which positions the roster is thin on |
| `/scrim when: team:` | staff | Posts a scrim with In / Maybe / Out buttons |
| `/refresh` | staff | Pull everyone's latest games from Riot right now |
| `/help` | anyone | The command list, replied privately |
| `/setkey` | staff | Paste a fresh Riot key |

"Staff" means Staff, LoL Officer, either captain, Coach, or the server owner.

## Champion pools

`/pool edit position:Mid` opens five boxes, one per tier, pre-filled with what
is already there:

| Tier | Means |
|---|---|
| 🟡 **S** | Blind pick, can carry |
| 🟣 **A** | Strong, happy any game |
| 🔵 **B** | Playable |
| ⚪ **Willing to learn** | Will practise if needed |
| ⚫ **Can't play** | Do not draft this |

The last one earns its place: knowing what someone *cannot* play is as useful in
a draft as knowing what they can.

Paste comma-separated names into whichever boxes apply and submit. Whatever is
left in the boxes becomes that role's pool, so adding, removing and moving a
champion between tiers all happen in one step. The reply says exactly what
changed, including promotions and demotions.

A champion typed into two boxes lands in the better one rather than being
duplicated.

Names are forgiving: `lee sin`, `leesin`, `LeeSin`, `asol`, `mf`, `j4` and
`mundo` all resolve. Anything unrecognised is reported back rather than silently
dropped.

`/pool gaps` judges a roster on **S and A** picks only, since those are the ones
you can actually draft. `Can't play` entries never count towards coverage.

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
