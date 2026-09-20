import assert from 'node:assert/strict'
import test from 'node:test'
import { isNewerAgentVersion, validateAgentRelease } from './deviceAgentRelease.js'

const fixture = {
  version: '1.0.1', tag: 'device-agent-v1.0.1', platform: 'windows-x64',
  installer: 'CarlosTechDeviceAgentSetup.exe', signed: true, sha256: 'a'.repeat(64), size: 12345,
  releaseUrl: 'https://github.com/example/device-agent/releases/tag/device-agent-v1.0.1',
  downloadUrl: 'https://github.com/example/device-agent/releases/download/device-agent-v1.0.1/CarlosTechDeviceAgentSetup.exe',
}

test('detects numeric version updates without offering a downgrade', () => {
  assert.equal(isNewerAgentVersion('1.0.1', '1.0.0'), true)
  assert.equal(isNewerAgentVersion('1.0.10', '1.0.9'), true)
  assert.equal(isNewerAgentVersion('1.0.9', '1.0.10'), false)
  assert.equal(isNewerAgentVersion('1.0.1', '1.1.0'), false)
  assert.equal(isNewerAgentVersion('1.0.1', '1.0.1'), false)
  assert.equal(isNewerAgentVersion('1.0.1', '1.0.1+build.7'), false)
})

test('handles prerelease precedence and unknown local versions', () => {
  assert.equal(isNewerAgentVersion('1.0.1', '1.0.1-rc.1'), true)
  assert.equal(isNewerAgentVersion('1.0.1', '1.1.0-rc.1'), false)
  assert.equal(isNewerAgentVersion('1.0.1-beta.10', '1.0.1-beta.9'), true)
  assert.equal(isNewerAgentVersion('1.0.1-beta', '1.0.1-alpha'), true)
  assert.equal(isNewerAgentVersion('1.0.1-alpha', '1.0.1-alpha.1'), false)
  for (const invalid of [undefined, '', 'unknown', '1.0', '01.0.0', '1.0.1-01']) {
    assert.equal(isNewerAgentVersion('1.0.1', invalid), false)
  }
})

test('accepts consistent signed official GitHub release metadata', () => {
  assert.deepEqual(validateAgentRelease(fixture), fixture)
})

test('rejects unsigned, incomplete and inconsistent metadata', () => {
  for (const change of [
    { signed: false }, { signed: 'true' }, { version: '1.0.1-beta.1' },
    { tag: 'device-agent-v1.0.0' }, { sha256: '' }, { size: 0 },
    { installer: 'other.exe' }, { platform: 'linux' },
    { downloadUrl: 'https://example.com/CarlosTechDeviceAgentSetup.exe' },
    { downloadUrl: fixture.downloadUrl.replace('https:', 'http:') },
    { downloadUrl: fixture.downloadUrl.replace('github.com', 'github.com.evil.invalid') },
    { downloadUrl: fixture.downloadUrl.replace('github.com', 'user:password@github.com') },
    { downloadUrl: `${fixture.downloadUrl}?redirect=other` },
    { downloadUrl: fixture.downloadUrl.replace('/example/', '/other/') },
    { releaseUrl: fixture.releaseUrl.replace('v1.0.1', 'v1.0.0') },
  ]) assert.throws(() => validateAgentRelease({ ...fixture, ...change }))
  assert.throws(() => validateAgentRelease(null))
})
