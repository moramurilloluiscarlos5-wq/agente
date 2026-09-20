// Only the official, published GitHub release is offered to clients. The signed
// flag is an attestation from our signing pipeline, not an Authenticode check
// performed by this Linux-compatible metadata service.
export const DEVICE_AGENT_INSTALLER = 'CarlosTechDeviceAgentSetup.exe'
const TAG = /^device-agent-v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/
const HASH = /^[a-f0-9]{64}$/i
const API = 'https://api.github.com'

function unavailable(message = 'No se pudo verificar la publicación oficial de CarlosTech Device Agent. Intenta nuevamente.') {
  return Object.assign(new Error(message), { status: 503, publicMessage: message })
}

function officialUrl(value, repository, suffix) {
  if (typeof value !== 'string') throw unavailable()
  const url = new URL(value)
  const parts = url.pathname.split('/')
  if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash
    || `${parts[1]}/${parts[2]}`.toLowerCase() !== repository.toLowerCase()
    || parts.slice(3).join('/') !== suffix) throw unavailable()
  return url.href
}

function getAsset(release, name, repository, maxSize = Number.MAX_SAFE_INTEGER) {
  const matches = release.assets.filter((asset) => asset.name === name)
  if (matches.length !== 1) throw unavailable()
  const asset = matches[0]
  if (asset.state !== 'uploaded' || !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > maxSize) throw unavailable()
  return { ...asset, browser_download_url: officialUrl(asset.browser_download_url, repository, `releases/download/${release.tag_name}/${name}`) }
}

function compareVersions(a, b) {
  const left = a.tag_name.match(TAG)[1].split('.').map(BigInt)
  const right = b.tag_name.match(TAG)[1].split('.').map(BigInt)
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] > right[index] ? -1 : 1
  }
  return 0
}

async function boundedText(response, maxBytes) {
  if (!response.ok || Number(response.headers.get('content-length')) > maxBytes) throw unavailable()
  const reader = response.body?.getReader()
  if (!reader) throw unavailable()
  const chunks = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) throw unavailable()
      chunks.push(Buffer.from(value))
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, '')
}

export function createDeviceAgentReleaseResolver({
  env = process.env, fetchImpl = globalThis.fetch, now = Date.now,
  cacheTtlMs = 60_000, timeoutMs = 10_000,
} = {}) {
  let cache = null
  let inflight = null
  let configurationKey = null

  async function resolve(repository, token) {
    const signal = AbortSignal.timeout(timeoutMs)
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'CarlosTech-Device-Agent-Releases' }
    if (token) headers.Authorization = `Bearer ${token}`
    const releases = []
    for (let page = 1; page <= 10; page++) {
      const response = await fetchImpl(`${API}/repos/${repository}/releases?per_page=100&page=${page}`, { headers, signal, redirect: 'error' })
      const entries = JSON.parse(await boundedText(response, 2_000_000))
      if (!Array.isArray(entries)) throw unavailable()
      releases.push(...entries.filter((release) => release && release.draft === false && release.prerelease === false && TAG.test(release.tag_name)))
      const hasNext = /<[^>]+>;\s*rel="next"/.test(response.headers.get('link') || '')
      if (!hasNext) break
      if (page === 10) throw unavailable()
    }
    const release = releases.sort(compareVersions)[0]
    if (!release) throw unavailable('No hay una publicación oficial estable de CarlosTech Device Agent disponible.')
    if (!Array.isArray(release.assets) || !release.published_at || !Number.isFinite(Date.parse(release.published_at))) throw unavailable()
    const version = release.tag_name.match(TAG)[1]
    const releaseUrl = officialUrl(release.html_url, repository, `releases/tag/${release.tag_name}`)
    const installer = getAsset(release, DEVICE_AGENT_INSTALLER, repository)
    const metadataAsset = getAsset(release, 'version.json', repository, 16_384)
    const sumsAsset = getAsset(release, 'SHA256SUMS.txt', repository, 16_384)
    // Public asset downloads never receive the optional server-side API token.
    // Requiring public metadata also prevents advertising private downloads.
    const [metadataText, sums] = await Promise.all([
      fetchImpl(metadataAsset.browser_download_url, { signal, redirect: 'follow' }).then((response) => boundedText(response, 16_384)),
      fetchImpl(sumsAsset.browser_download_url, { signal, redirect: 'follow' }).then((response) => boundedText(response, 16_384)),
    ])
    const metadata = JSON.parse(metadataText)
    if (!metadata || metadata.signed !== true || metadata.version !== version || metadata.tag !== release.tag_name
      || metadata.platform !== 'windows-x64' || metadata.installer !== DEVICE_AGENT_INSTALLER
      || (metadata.file !== undefined && metadata.file !== DEVICE_AGENT_INSTALLER)
      || typeof metadata.sha256 !== 'string' || !HASH.test(metadata.sha256)
      || (metadata.size !== undefined && metadata.size !== installer.size)) throw unavailable()
    const sha256 = metadata.sha256.toLowerCase()
    const checksumLines = sums.split(/\r?\n/).filter((line) => line.trim())
    const checksumMatches = checksumLines.map((line) => line.match(/^([a-f0-9]{64}) [ *](.+)$/i)).filter((match) => match?.[2] === DEVICE_AGENT_INSTALLER)
    if (checksumMatches.length !== 1 || checksumMatches[0][1].toLowerCase() !== sha256) throw unavailable()
    if (installer.digest != null && installer.digest.toLowerCase() !== `sha256:${sha256}`) throw unavailable()
    return Object.freeze({
      version, tag: release.tag_name, platform: 'windows-x64', installer: DEVICE_AGENT_INSTALLER,
      file: DEVICE_AGENT_INSTALLER, signed: true, sha256, size: installer.size,
      downloadUrl: installer.browser_download_url, releaseUrl, releaseDate: release.published_at,
    })
  }

  return async function getRelease() {
    const repository = env.DEVICE_AGENT_GITHUB_REPOSITORY?.trim()
    if (!repository || !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(repository) || repository.endsWith('/.') || repository.endsWith('/..')) {
      throw unavailable('La publicación oficial del agente no está configurada: falta DEVICE_AGENT_GITHUB_REPOSITORY (owner/repo).')
    }
    const token = env.DEVICE_AGENT_GITHUB_TOKEN?.trim()
    const key = `${repository}:${token || ''}`
    if (key !== configurationKey) {
      configurationKey = key
      cache = null
      inflight = null
    }
    if (cache && cache.expiresAt > now()) return cache.release
    if (inflight) return inflight
    const request = resolve(repository, token).then((release) => {
      if (configurationKey === key) cache = { release, expiresAt: now() + cacheTtlMs }
      return release
    }).catch((error) => {
      // An expired cached result is never used to mask an upstream failure.
      if (error.status === 503 && error.publicMessage) throw error
      throw unavailable()
    }).finally(() => {
      if (inflight === request) inflight = null
    })
    inflight = request
    return request
  }
}

export const getDeviceAgentRelease = createDeviceAgentReleaseResolver()
