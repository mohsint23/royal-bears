/**
 * Renders the bot's embeds the way Discord will, on http://127.0.0.1:7333.
 *
 *   npm run preview
 *
 * Exists so embed layout can be worked on by looking at it, rather than by
 * posting draft after draft into the team's channels.
 */
import { createServer } from 'node:http'
import { accounts } from './bot/db.js'
import { buildProfile } from './bot/commands/profile.js'
import { buildTeam } from './bot/commands/team.js'
import { rolesEmbed } from './bot/roles.js'
import { buildAttendance, type PlayerWeek } from './bot/jobs/attendance.js'
import { matches } from './bot/db.js'
import { loadChampions } from './bot/ddragon.js'

await loadChampions()

const fake = (id: string, name: string) => ({
  id, displayName: name, toString: () => `<@${id}>`,
  displayAvatarURL: () => `https://api.dicebear.com/7.x/initials/png?seed=${encodeURIComponent(name)}`,
})

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
const md = (s: string) => {
  // code blocks first, so their contents are not touched by the inline rules
  const blocks: string[] = []
  let out = s.replace(/```\n?([\s\S]*?)```/g, (_, body) => {
    blocks.push(`<pre>${esc(body.replace(/\n$/, ''))}</pre>`)
    return `\u0000${blocks.length - 1}\u0000`
  })
  out = esc(out)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^-# (.+)$/gm, '<span class="sub">$1</span>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a>$1</a>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
  return out.replace(/\u0000(\d+)\u0000/g, (_, n) => blocks[Number(n)]!)
}

function render(e: any) {
  const fields = (e.fields ?? [])
  let html = ''
  let row: any[] = []
  const flush = () => {
    if (!row.length) return
    html += `<div class="row">${row.map((f) => `<div class="field ${f.inline ? 'inline' : ''}"><div class="fname">${md(f.name)}</div><div class="fval">${md(f.value)}</div></div>`).join('')}</div>`
    row = []
  }
  for (const f of fields) {
    if (f.inline) { row.push(f); if (row.length === 3) flush() }
    else { flush(); row = [f]; flush() }
  }
  flush()
  return `<div class="embed" style="border-left-color:#${(e.color ?? 0).toString(16).padStart(6, '0')}">
    <div class="grid">
      <div>
        ${e.author ? `<div class="author"><img src="${e.author.icon_url}"><span>${esc(e.author.name)}</span></div>` : ''}
        ${e.title ? `<div class="title">${esc(e.title)}</div>` : ''}
        ${e.description ? `<div class="desc">${md(e.description)}</div>` : ''}
        ${html}
      </div>
      ${e.thumbnail ? `<img class="thumb" src="${e.thumbnail.url}">` : ''}
    </div>
    ${e.footer ? `<div class="footer">${esc(e.footer.text)} • Today at 23:59</div>` : ''}
  </div>`
}

const all = accounts.all()
const message = (embed: any) =>
  `<div class="msg"><div class="mhead"><img class="pfp" src="https://api.dicebear.com/7.x/shapes/png?seed=bear"><span class="bot">Royal Bear</span><span class="tag">APP</span></div>${render(embed)}</div>`

const mains = all.filter((a) => a.is_main)
// Group by owner so alts render under their player, as /team now does.
const roster = mains.map((main) => ({
  name: main.game_name.split(' ').pop() ?? 'Player',
  accounts: all.filter((a) => a.discord_id === main.discord_id),
}))

// A deliberately mixed week, so the below-target layout can be looked at too.
const week = Date.now() - 7 * 24 * 60 * 60 * 1000
const rankedFor = (puuid: string) => matches.since(puuid, week).filter((m) => [420, 440].includes(m.queue_id))
const attendance: PlayerWeek[] = [
  { discordId: mains[0]!.discord_id, name: 'mo', team: 'a', games: rankedFor(mains[0]!.puuid), registered: true },
  { discordId: mains[1]!.discord_id, name: 'Chia', team: 'a', games: rankedFor(mains[1]!.puuid).slice(0, 4), registered: true },
  { discordId: '3', name: 'Connorgunn', team: 'b', games: [], registered: false },
  { discordId: '4', name: 'Ali', team: 'b', games: rankedFor(mains[0]!.puuid).slice(0, 9), registered: true },
]

const bodies =
  message(buildAttendance(attendance, { mode: 'pace', day: 3 }).embed.toJSON()) +
  message(buildAttendance(attendance, { mode: 'final' }).embed.toJSON()) +
  message(buildTeam('A Team', roster, ['Connor', 'Ali']).toJSON()) +
  message(rolesEmbed((n) => `#${n}`).toJSON()) +
  '<div class="buttons">' +
  ['⬆️ Top', '🌿 Jungle', '✳️ Mid', '🏹 ADC', '🛡️ Support'].map((b) => `<span class="btn">${b}</span>`).join('') +
  '</div>' +
  // /profile with no account: renders one of these per linked account.
  accounts
    .forUser(all[0]!.discord_id)
    .map((a) => message(buildProfile(fake(a.discord_id, 'mo'), a, accounts.forUser(a.discord_id), '', false).toJSON()))
    .join('')

const page = `<!doctype html><meta charset="utf-8"><style>
  body{background:#313338;margin:0;padding:24px;font:400 16px/1.375 "gg sans",Helvetica,Arial,sans-serif;color:#dbdee1}
  .msg{max-width:600px;margin:0 0 26px}
  .mhead{display:flex;align-items:center;gap:8px;margin-bottom:4px}
  .pfp{width:40px;height:40px;border-radius:50%}
  .bot{color:#f2f3f5;font-weight:500}
  .tag{background:#5865f2;color:#fff;font-size:10px;padding:1px 4px;border-radius:3px;font-weight:600}
  .embed{background:#2b2d31;border-radius:4px;border-left:4px solid;padding:8px 16px 16px 12px;margin-left:48px;max-width:520px}
  .grid{display:flex;gap:16px;justify-content:space-between}
  .author{display:flex;align-items:center;gap:8px;margin:8px 0 8px;font-size:14px;font-weight:600;color:#f2f3f5}
  .author img{width:24px;height:24px;border-radius:50%}
  .title{color:#00a8fc;font-weight:600;font-size:16px;margin-bottom:8px}
  .desc{font-size:14px;color:#dbdee1;margin-bottom:8px}
  .row{display:flex;gap:8px;margin-top:8px}
  .field{flex:1;min-width:0}
  .fname{font-size:14px;font-weight:600;color:#f2f3f5;margin-bottom:2px}
  .fval{font-size:14px;color:#dbdee1}
  .thumb{width:80px;height:80px;border-radius:4px;flex:0 0 80px;object-fit:cover;margin-top:8px}
  .footer{font-size:12px;color:#949ba4;margin-top:8px}
  b{font-weight:700;color:#f2f3f5} code{background:#1e1f22;padding:1px 4px;border-radius:3px;font-size:13px}
  h3{font-size:16px;font-weight:700;color:#f2f3f5;margin:0 0 2px}
  .sub{font-size:12px;color:#949ba4}
  .buttons{margin:-20px 0 26px 48px;display:flex;gap:8px;max-width:520px}
  .btn{background:#4e5058;color:#fff;font-size:14px;font-weight:500;padding:8px 14px;border-radius:3px}
  pre{background:#1e1f22;border:1px solid #1e1f22;border-radius:4px;padding:8px;margin:2px 0 0;
      font:400 13px/1.35 Consolas,"Courier New",monospace;color:#dbdee1;white-space:pre;overflow-x:auto}
</style>${bodies}`

createServer((_, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(page) }).listen(7333, () =>
  console.log('preview on http://127.0.0.1:7333'),
)
