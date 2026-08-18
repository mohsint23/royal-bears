/**
 * Watches for a new League patch and posts the notes once.
 *
 * Data Dragon publishes a new version the moment a patch goes live, which makes
 * it a reliable trigger — no polling of the news page needed until there is
 * actually something to fetch.
 */

import { ChannelType, type Client, type Guild, type TextChannel } from 'discord.js'
import { config } from '../config.js'
import { settings } from '../db.js'
import { fetchPatchNotes, patchEmbed } from '../patch.js'

const LAST = 'last_patch_version'
const VERSIONS = 'https://ddragon.leagueoflegends.com/api/versions.json'
const HOUR = 60 * 60 * 1000

export async function latestVersion(): Promise<string | undefined> {
  const versions = (await fetch(VERSIONS).then((r) => r.json())) as string[]
  return versions[0]
}

export async function patchChannel(guild: Guild): Promise<TextChannel | undefined> {
  await guild.channels.fetch()
  return guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name === config.patchChannel,
  ) as TextChannel | undefined
}

/** Only the major.minor matters: Data Dragon bumps the third part for hotfixes. */
const seriesOf = (version: string) => version.split('.').slice(0, 2).join('.')

export async function postPatch(guild: Guild, version: string): Promise<boolean> {
  const channel = await patchChannel(guild)
  if (!channel) {
    console.error(`[patch] no #${config.patchChannel} channel — run "npm run setup".`)
    return false
  }

  const notes = await fetchPatchNotes(version)
  if (!notes) {
    console.error(`[patch] no notes page found for ${version} yet.`)
    return false
  }

  await channel.send({ embeds: [patchEmbed(notes)] })
  return true
}

export async function checkPatch(guild: Guild): Promise<void> {
  const version = await latestVersion()
  if (!version) return

  const seen = settings.get(LAST)
  if (seen && seriesOf(seen) === seriesOf(version)) return

  // Record first: a notes page that is not up yet should not make this retry
  // every hour forever, and the next patch will trigger it again anyway.
  const posted = await postPatch(guild, version)
  if (posted || seen) settings.set(LAST, version)
  if (posted) console.log(`[patch] posted notes for ${version}.`)
}

export function startPatchWatch(client: Client) {
  const tick = async () => {
    const guild = client.guilds.cache.get(config.guildId)
    if (!guild) return
    await checkPatch(guild).catch((err) => console.error('[patch] failed:', err))
  }
  void tick()
  setInterval(tick, HOUR)
}
