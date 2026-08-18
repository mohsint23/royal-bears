/**
 * League patch notes.
 *
 * Riot publishes no API for these, so this reads the public notes page. Two
 * things make that less fragile than it sounds: the slug is discovered from
 * Riot's own listing rather than guessed, and the summary comes from the
 * og: tags, which Riot maintains for link previews and rarely changes.
 *
 * Numbering is the catch. Data Dragon calls the current patch 16.15.1 while the
 * website calls it 26.15 — the major is ten higher on the site.
 */

import { baseEmbed, BRAND } from './format.js'

const LISTING = 'https://www.leagueoflegends.com/en-gb/news/game-updates/'
const SITE = 'https://www.leagueoflegends.com'
const MAJOR_OFFSET = 10

export type PatchNotes = {
  version: string
  patch: string
  url: string
  title: string
  summary: string
  image?: string
  sections: { name: string; entries: string[] }[]
}

/** "16.15.1" -> "26.15", the number Riot's own page uses. */
export function patchLabel(version: string): string {
  const [major, minor] = version.split('.')
  return `${Number(major) + MAJOR_OFFSET}.${minor}`
}

const strip = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const meta = (html: string, property: string) => {
  const m = html.match(new RegExp(`<meta property="og:${property}" content="([^"]*)"`))
  return m ? strip(m[1]!) : undefined
}

/**
 * Riot has changed the slug between seasons — "patch-25-24-notes" became
 * "league-of-legends-patch-26-15-notes" — so match on the stable middle rather
 * than assuming a prefix.
 */
export async function findPatchUrl(patch: string): Promise<string | undefined> {
  const [major, minor] = patch.split('.')
  const listing = await fetch(LISTING).then((r) => r.text())
  const wanted = new RegExp(`/en-gb/news/game-updates/([a-z0-9-]*patch-${major}-${minor}-notes)/?`)
  const hit = listing.match(wanted)
  return hit ? `${SITE}/en-gb/news/game-updates/${hit[1]}/` : undefined
}

/**
 * Champions and items that changed, grouped under the section they sit in.
 * Headings are walked in document order so each h3 lands under its own h2.
 */
export function parseSections(html: string): { name: string; entries: string[] }[] {
  const body = html.split('Related Articles')[0] ?? html
  const found: { level: number; text: string; at: number }[] = []

  for (const level of [2, 3]) {
    const re = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)</h${level}>`, 'g')
    for (let m = re.exec(body); m; m = re.exec(body)) {
      const text = strip(m[1]!)
      if (text) found.push({ level, text, at: m.index })
    }
  }
  found.sort((a, b) => a.at - b.at)

  const sections: { name: string; entries: string[] }[] = []
  let current: { name: string; entries: string[] } | undefined

  for (const node of found) {
    if (node.level === 2) {
      current = { name: node.text, entries: [] }
      sections.push(current)
    } else if (current) {
      current.entries.push(node.text)
    }
  }
  return sections.filter((s) => s.entries.length)
}

export async function fetchPatchNotes(version: string): Promise<PatchNotes | undefined> {
  const patch = patchLabel(version)
  const url = await findPatchUrl(patch)
  if (!url) return undefined

  const html = await fetch(url).then((r) => (r.ok ? r.text() : ''))
  if (!html) return undefined

  return {
    version,
    patch,
    url,
    title: meta(html, 'title') ?? `Patch ${patch} Notes`,
    summary: meta(html, 'description') ?? '',
    image: meta(html, 'image'),
    sections: parseSections(html),
  }
}

/** Sections worth putting in front of a team, in the order they matter. */
const HEADLINE = ['Champions', 'Items', 'Runes', 'Arena', 'ARAM']

export function patchEmbed(notes: PatchNotes) {
  const embed = baseEmbed()
    .setColor(BRAND)
    .setTitle(notes.title)
    .setURL(notes.url)
    .setDescription(notes.summary.slice(0, 600))

  if (notes.image) embed.setImage(notes.image)

  for (const name of HEADLINE) {
    const section = notes.sections.find((s) => s.name.toLowerCase() === name.toLowerCase())
    if (!section) continue
    embed.addFields({
      name: `${section.name} — ${section.entries.length}`,
      value: section.entries.join(' · ').slice(0, 1024),
      inline: false,
    })
  }

  const others = notes.sections
    .filter((s) => !HEADLINE.some((h) => h.toLowerCase() === s.name.toLowerCase()))
    .map((s) => s.name)
  if (others.length) {
    embed.addFields({ name: 'Also in this patch', value: others.join(' · ').slice(0, 1024) })
  }

  return embed
}
