import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createDeviceAgentRouter } from '../routes/deviceAgent.routes.js'
import { createDeviceToolsRouter } from '../routes/deviceTools.routes.js'
import { createDeviceAgentReleaseResolver, DEVICE_AGENT_INSTALLER } from '../services/deviceAgentRelease.js'

const repository = 'carlostech/device-agent'
const sha256 = 'abc01234'.repeat(8)
const publishedAt = '2026-09-19T12:00:00Z'
const assetUrl = (name, version = '1.0.1') => `https://github.com/${repository}/releases/download/device-agent-v${version}/${name}`

function fixture(version = '1.0.1') {
  const metadata = { version, tag: `device-agent-v${version}`, platform: 'windows-x64', installer: DEVICE_AGENT_INSTALLER, signed: true, sha256, size: 1024 }
  const release = {
    tag_name: metadata.tag, draft: false, prerelease: false, published_at: publishedAt,
    html_url: `https://github.com/${repository}/releases/tag/${metadata.tag}`,
    assets: [DEVICE_AGENT_INSTALLER, 'version.json', 'SHA256SUMS.txt'].map((name) => ({
      name, state: 'uploaded', size: name === DEVICE_AGENT_INSTALLER ? 1024 : 256,
      browser_download_url: assetUrl(name, version),
      ...(name === DEVICE_AGENT_INSTALLER ? { digest: `sha256:${sha256}` } : {}),
    })),
  }
  return { release, metadata, sums: `${sha256}  ${DEVICE_AGENT_INSTALLER}\n` }
}

function mockGitHub(data, { releases = [data.release], pages, env = {}, ...options } = {}) {
  const calls = []
  const getRelease = createDeviceAgentReleaseResolver({
    env: { DEVICE_AGENT_GITHUB_REPOSITORY: repository, ...env }, ...options,
    fetchImpl: async (url, init) => {
      calls.push({ url, init })
      if (url.startsWith('https://api.github.com/')) {
        const page = Number(new URL(url).searchParams.get('page'))
        const content = pages ? pages[page - 1] : releases
        const headers = pages && page < pages.length ? { link: `<https://api.github.com/repos/${repository}/releases?per_page=100&page=${page + 1}>; rel="next"` } : {}
        return new Response(JSON.stringify(content), { headers })
      }
      if (url === assetUrl('version.json', data.metadata.version)) return new Response(JSON.stringify(data.metadata))
      if (url === assetUrl('SHA256SUMS.txt', data.metadata.version)) return new Response(data.sums)
      return new Response('Not found', { status: 404 })
    },
  })
  return { getRelease, calls }
}

async function serve(t, getRelease) {
  const app = express()
  app.use('/api/device-agent', createDeviceAgentRouter({ getRelease }))
  const authenticate = [(req, _res, next) => {
    req.profile = { id: 'user', role: 'TECNICO', permissions: ['*'], permissionsSource: 'legacy', workshop_id: 'workshop', workspace_access: 'ACTIVE' }
    next()
  }]
  app.use('/api/device-tools', createDeviceToolsRouter({ db: {}, authenticate, getRelease }))
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.publicMessage || error.message }))
  const server = await new Promise((resolve) => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return (path) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { redirect: 'manual' })
}

test('official metadata, public download redirect and authenticated web release agree', async (t) => {
  const { getRelease, calls } = mockGitHub(fixture(), { env: { DEVICE_AGENT_GITHUB_TOKEN: 'test-api-token' } })
  const request = await serve(t, getRelease)
  const metadataResponse = await request('/api/device-agent/latest-version')
  assert.equal(metadataResponse.status, 200)
  const metadata = await metadataResponse.json()
  assert.deepEqual(metadata, {
    version: '1.0.1', tag: 'device-agent-v1.0.1', platform: 'windows-x64', installer: DEVICE_AGENT_INSTALLER,
    file: DEVICE_AGENT_INSTALLER, signed: true, sha256, size: 1024, downloadUrl: assetUrl(DEVICE_AGENT_INSTALLER),
    releaseUrl: `https://github.com/${repository}/releases/tag/device-agent-v1.0.1`, releaseDate: publishedAt,
  })
  const downloadResponse = await request('/api/device-agent/download')
  assert.equal(downloadResponse.status, 302)
  assert.equal(downloadResponse.headers.get('location'), metadata.downloadUrl)
  assert.equal(downloadResponse.headers.get('cache-control'), 'no-store')
  const webResponse = await request('/api/device-tools/release')
  assert.equal(webResponse.status, 200)
  assert.deepEqual(await webResponse.json(), { data: { ...metadata, download_url: metadata.downloadUrl, release_page: metadata.releaseUrl } })
  assert.equal(calls.length, 3, 'all routes share the validated cache')
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-api-token')
  assert.ok(calls.slice(1).every(({ init }) => !init.headers?.Authorization), 'public metadata requests do not carry API credentials')
})

test('missing repository fails closed even when old download variables are set', async (t) => {
  const getRelease = createDeviceAgentReleaseResolver({
    env: { DEVICE_AGENT_RELEASE_URL: 'https://example.com/unsigned.exe', DEVICE_AGENT_VERSION: '1.0.0' },
    fetchImpl: () => { assert.fail('must not query GitHub without the official repository') },
  })
  const request = await serve(t, getRelease)
  for (const path of ['/api/device-agent/latest-version', '/api/device-agent/download', '/api/device-tools/release']) {
    const response = await request(path)
    assert.equal(response.status, 503)
    assert.equal(response.headers.get('location'), null)
    assert.match((await response.json()).message, /DEVICE_AGENT_GITHUB_REPOSITORY/)
  }
})

test('latest stable agent version is selected numerically across pages and unrelated releases', async () => {
  const latest = fixture('1.10.0')
  const { getRelease, calls } = mockGitHub(latest, { pages: [
    [{ ...fixture('8.0.0').release, tag_name: 'web-v8.0.0' }, { ...fixture('9.0.0').release, draft: true }, { ...fixture('7.0.0').release, prerelease: true }],
    [fixture('1.9.0').release, latest.release, { ...fixture('1.11.0').release, tag_name: 'device-agent-v1.11.0-beta.1' }],
  ] })
  assert.equal((await getRelease()).version, '1.10.0')
  assert.equal(calls.filter(({ url }) => url.startsWith('https://api.github.com')).length, 2)
})

test('invalid newest release never falls back to an older installer', async (t) => {
  const cases = [
    ['unsigned', (data) => { data.metadata.signed = false }],
    ['missing signature attestation', (data) => { delete data.metadata.signed }],
    ['string signature attestation', (data) => { data.metadata.signed = 'true' }],
    ['wrong tag', (data) => { data.metadata.tag = 'device-agent-v1.0.0' }],
    ['wrong platform', (data) => { data.metadata.platform = 'linux-x64' }],
    ['wrong installer', (data) => { data.metadata.installer = 'other.exe' }],
    ['malformed hash', (data) => { data.metadata.sha256 = 'not-a-hash' }],
    ['size mismatch', (data) => { data.metadata.size = 999 }],
    ['digest mismatch', (data) => { data.release.assets[0].digest = `sha256:${'0'.repeat(64)}` }],
    ['checksum mismatch', (data) => { data.sums = `${'0'.repeat(64)}  ${DEVICE_AGENT_INSTALLER}\n` }],
    ['duplicate checksum', (data) => { data.sums += data.sums }],
    ['missing installer', (data) => { data.release.assets.shift() }],
    ['unfinished upload', (data) => { data.release.assets[0].state = 'new' }],
    ['missing checksum asset', (data) => { data.release.assets.pop() }],
    ['missing metadata', (data) => { data.release.assets.splice(1, 1) }],
    ['third-party download', (data) => { data.release.assets[0].browser_download_url = `https://downloads.example.com/${DEVICE_AGENT_INSTALLER}` }],
    ['other repository', (data) => { data.release.assets[0].browser_download_url = assetUrl(DEVICE_AGENT_INSTALLER).replace(repository, 'attacker/repo') }],
  ]
  for (const [name, mutate] of cases) {
    await t.test(name, async (t) => {
      const data = fixture()
      mutate(data)
      const { getRelease } = mockGitHub(data, { releases: [data.release, fixture('1.0.0').release] })
      const request = await serve(t, getRelease)
      const response = await request('/api/device-agent/download')
      assert.equal(response.status, 503)
      assert.equal(response.headers.get('location'), null)
    })
  }
})

test('concurrent calls coalesce and cache expires without stale fallback', async () => {
  let currentTime = 0
  const data = fixture()
  const { getRelease, calls } = mockGitHub(data, { now: () => currentTime })
  const results = await Promise.all([getRelease(), getRelease(), getRelease()])
  assert.equal(results[0], results[1])
  assert.equal(calls.length, 3)
  currentTime = 59_999
  await getRelease()
  assert.equal(calls.length, 3)
  currentTime = 60_001
  data.metadata.signed = false
  await assert.rejects(getRelease, { status: 503 })
  assert.equal(calls.length, 6)
})

test('GitHub outage, rate limit and timeout return 503 without leaking upstream details', async (t) => {
  for (const status of [403, 404, 429, 500]) {
    const getRelease = createDeviceAgentReleaseResolver({
      env: { DEVICE_AGENT_GITHUB_REPOSITORY: repository },
      fetchImpl: async () => new Response('private upstream details', { status }),
    })
    await assert.rejects(getRelease, (error) => error.status === 503 && !error.message.includes('private upstream'))
  }
  const getRelease = createDeviceAgentReleaseResolver({
    env: { DEVICE_AGENT_GITHUB_REPOSITORY: repository }, timeoutMs: 10,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
  })
  const request = await serve(t, getRelease)
  assert.equal((await request('/api/device-agent/latest-version')).status, 503)
})

test('no published stable agent is unavailable, not an invented version', async () => {
  const { getRelease } = mockGitHub(fixture(), { releases: [] })
  await assert.rejects(getRelease, { status: 503 })
})
