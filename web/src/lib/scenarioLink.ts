// Lab scenario links come in three forms:
//   #scenario=<base64url(JSON)>                  plain
//   #scenarioz=<base64url(deflate-raw(JSON))>    compressed
//   #s2=<base64url(deflate-raw(compact JSON))>   compact: a few readings and the bill, on top of the built-in sample
//   #lab=<seed>.<min>.<max>.<flags>              tiny: an unedited lab month, rebuilt with labMonth.ts (shared with the lab)
// The first two reduce to the plain base64url payload that parseScenario() reads. The compact form
// is rebuilt into a full scenario by the API (it needs the built-in sample states).

const toB64 = (u: string) => u.replace(/-/g, '+').replace(/_/g, '/')

/** Inflates a base64url deflate-raw payload to its UTF-8 text; null when it is damaged. */
export async function inflateText(z: string): Promise<string | null> {
  try {
    const b64 = toB64(z)
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
    return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text()
  } catch {
    return null
  }
}

/** Inflates a `scenarioz` payload into the plain base64url payload; null when it is damaged. */
export async function inflateScenarioPayload(z: string): Promise<string | null> {
  const json = await inflateText(z)
  if (json == null) return null
  const utf8 = new TextEncoder().encode(json)
  let s = ''
  for (const b of utf8) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export type ScenarioLinkPayload =
  | { kind: 'plain'; payload: string } // base64url of the full scenario JSON
  | { kind: 'compact'; json: string | null } // the inflated compact JSON; null when damaged
  | { kind: 'lab'; value: string } // the part after #lab=, parsed by labMonth.parseLabLink

/** The payload in a full link, bare hash or fragment; null when it holds no scenario. */
export async function scenarioPayloadFromLink(link: string): Promise<ScenarioLinkPayload | null> {
  const hit = /(?:#|&)(scenarioz|scenario|s2|lab)=([^&\s]*)/.exec(link)
  if (!hit) return null
  if (hit[1] === 'lab') return { kind: 'lab', value: hit[2] }
  if (hit[1] === 'scenario') return { kind: 'plain', payload: hit[2] }
  if (hit[1] === 's2') return { kind: 'compact', json: await inflateText(hit[2]) }
  // '!' is not base64url, so validation tells the person the link is damaged.
  return { kind: 'plain', payload: (await inflateScenarioPayload(hit[2])) ?? '!' }
}
