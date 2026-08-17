/**
 * Data Dragon is Riot's public asset CDN. No API key, no rate limit — it is
 * how we get champion names and portrait images.
 */

let version = '15.1.1'
/** Lowercased display name -> canonical id, e.g. "lee sin" -> "LeeSin". */
let champions = new Map<string, { id: string; name: string }>()
let loadedAt = 0

const DAY = 24 * 60 * 60 * 1000

export async function loadChampions(force = false) {
  if (!force && champions.size && Date.now() - loadedAt < DAY) return

  const versions = (await fetch('https://ddragon.leagueoflegends.com/api/versions.json').then((r) =>
    r.json(),
  )) as string[]
  version = versions[0] ?? version

  const data = (await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
  ).then((r) => r.json())) as { data: Record<string, { id: string; name: string }> }

  const next = new Map<string, { id: string; name: string }>()
  for (const champ of Object.values(data.data)) {
    next.set(champ.name.toLowerCase(), { id: champ.id, name: champ.name })
    next.set(champ.id.toLowerCase(), { id: champ.id, name: champ.name })
  }
  champions = next
  loadedAt = Date.now()
}

/** Turns loose user input ("leesin", "Lee Sin") into Riot's display name. */
export function resolveChampion(input: string): { id: string; name: string } | undefined {
  const cleaned = input.trim().toLowerCase()
  return champions.get(cleaned) ?? champions.get(cleaned.replace(/[^a-z]/g, ''))
}

export function championIcon(idOrName: string): string {
  const champ = resolveChampion(idOrName)
  return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champ?.id ?? idOrName}.png`
}

/** Autocomplete source: up to 25 champions matching what has been typed. */
export function searchChampions(query: string): { id: string; name: string }[] {
  const q = query.trim().toLowerCase()
  const seen = new Set<string>()
  const out: { id: string; name: string }[] = []
  for (const champ of champions.values()) {
    if (seen.has(champ.id)) continue
    if (q && !champ.name.toLowerCase().includes(q)) continue
    seen.add(champ.id)
    out.push(champ)
    if (out.length >= 25) break
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
