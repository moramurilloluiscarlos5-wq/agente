const INSTALLER = 'CarlosTechDeviceAgentSetup.exe'
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

function parseVersion(value) {
  if (typeof value !== 'string') return null
  const match = value.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/)
  if (!match) return null
  const prerelease = match[4]?.split('.') || []
  if (prerelease.some((part) => /^0\d+$/.test(part))) return null
  return { numbers: match.slice(1, 4).map(BigInt), prerelease }
}

// Compare numeric components, not strings (1.0.10 is newer than 1.0.9).
export function isNewerAgentVersion(latest, installed) {
  const next = parseVersion(latest)
  const current = parseVersion(installed)
  if (!next || !current) return false
  for (let index = 0; index < 3; index += 1) {
    if (next.numbers[index] !== current.numbers[index]) return next.numbers[index] > current.numbers[index]
  }
  if (!next.prerelease.length || !current.prerelease.length) return !next.prerelease.length && current.prerelease.length > 0
  for (let index = 0; index < Math.max(next.prerelease.length, current.prerelease.length); index += 1) {
    const a = next.prerelease[index]
    const b = current.prerelease[index]
    if (a === b) continue
    if (a === undefined || b === undefined) return b === undefined
    const aNumeric = /^\d+$/.test(a)
    const bNumeric = /^\d+$/.test(b)
    if (aNumeric && bNumeric) return BigInt(a) > BigInt(b)
    if (aNumeric !== bNumeric) return !aNumeric
    return a > b
  }
  return false
}

export function validateAgentRelease(release) {
  const invalid = () => { throw new Error('La publicación oficial no contiene un instalador firmado válido.') }
  if (!release || !STABLE_VERSION.test(release.version) || release.tag !== `device-agent-v${release.version}` ||
      release.platform !== 'windows-x64' || release.installer !== INSTALLER || release.signed !== true ||
      !/^[a-f0-9]{64}$/i.test(release.sha256) || !Number.isSafeInteger(release.size) || release.size <= 0) invalid()
  let downloadUrl
  let releaseUrl
  try {
    downloadUrl = new URL(release.downloadUrl)
    releaseUrl = new URL(release.releaseUrl)
  } catch { invalid() }
  for (const url of [downloadUrl, releaseUrl]) {
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) invalid()
  }
  const path = releaseUrl.pathname.match(/^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/releases\/tag\/([^/]+)$/)
  if (!path || path[3] !== release.tag || downloadUrl.pathname !== `/${path[1]}/${path[2]}/releases/download/${release.tag}/${INSTALLER}`) invalid()
  return { ...release, downloadUrl: downloadUrl.href, releaseUrl: releaseUrl.href }
}

export function validateExternalAgentRelease(release) {
  if (!release || release.source !== 'external' || !STABLE_VERSION.test(release.version) ||
      release.tag !== `device-agent-v${release.version}` || release.platform !== 'windows-x64' ||
      release.installer !== INSTALLER || release.signed !== false) throw new Error('La descarga externa del agente no es válida.')
  let url
  try { url = new URL(release.downloadUrl) } catch { throw new Error('La descarga externa del agente no es válida.') }
  if (url.protocol !== 'https:' || !['mediafire.com', 'www.mediafire.com'].includes(url.hostname) || url.username || url.password) throw new Error('La descarga externa del agente no es válida.')
  return { ...release, downloadUrl: url.href, releaseUrl: url.href }
}
