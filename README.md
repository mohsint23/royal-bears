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

## Still to come

The tracker bot: `/register`, `/profile`, `/team`, `/multi`, `/pool`, `/scrim`,
plus automatic rank roles and weekly stat roundups in `#stat-updates`.
