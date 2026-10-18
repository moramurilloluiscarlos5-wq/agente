import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { EventEmitter } from 'node:events'
import { installLifecycleHandlers } from '../utils/lifecycle.js'

const silent = () => ({ messages: [], info() {}, error(...args) { this.messages.push(args.join(' ')) } })

async function listen(t, handler) {
  const server = http.createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => { server.closeAllConnections(); if (server.listening) server.close() })
  return { server, url: `http://127.0.0.1:${server.address().port}/` }
}

function trackExit() {
  let finish
  const exited = new Promise((resolve) => { finish = resolve })
  return { exit: (code) => finish(code), exited }
}

test('SIGTERM: termina la petición en curso, rechaza las nuevas y sale con código 0', async (t) => {
  let release
  const gate = new Promise((resolve) => { release = resolve })
  let received
  const arrived = new Promise((resolve) => { received = resolve })
  const { server, url } = await listen(t, async (_req, res) => { received(); await gate; res.end('listo') })
  const proc = new EventEmitter()
  const { exit, exited } = trackExit()
  const events = []
  installLifecycleHandlers({ server, logger: silent(), proc, exit, onShutdown: () => events.push('liberado') })

  const inFlight = fetch(url)
  await arrived
  proc.emit('SIGTERM')
  await new Promise((resolve) => setImmediate(resolve))

  await assert.rejects(fetch(url), 'una conexión nueva debe rechazarse mientras se cierra')
  release()
  const response = await inFlight
  assert.equal(await response.text(), 'listo')
  assert.equal(await exited, 0)
  assert.deepEqual(events, ['liberado'])
})

test('si las peticiones no terminan a tiempo se cierran las conexiones y se sale con código 1', async (t) => {
  const logger = silent()
  const { server, url } = await listen(t, () => {})
  const proc = new EventEmitter()
  const { exit, exited } = trackExit()
  installLifecycleHandlers({ server, logger, proc, exit, timeoutMs: 100 })

  const hanging = fetch(url).catch((error) => error)
  await new Promise((resolve) => setTimeout(resolve, 50))
  proc.emit('SIGINT')

  assert.equal(await exited, 1)
  assert.ok((await hanging) instanceof Error, 'la petición colgada se corta')
  assert.match(logger.messages.join('\n'), /superó 100 ms/)
})

test('varias señales seguidas solo cierran una vez', async (t) => {
  const { server } = await listen(t, (_req, res) => res.end())
  const proc = new EventEmitter()
  const exits = []
  let hooks = 0
  const { exited, exit } = trackExit()
  installLifecycleHandlers({ server, logger: silent(), proc, exit: (code) => { exits.push(code); exit(code) }, onShutdown: () => { hooks += 1 } })

  proc.emit('SIGTERM')
  proc.emit('SIGTERM')
  proc.emit('SIGINT')
  await exited
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.deepEqual(exits, [0])
  assert.equal(hooks, 1)
})

test('una promesa rechazada sin capturar se registra y el servidor sigue en pie', async (t) => {
  const logger = silent()
  const { server, url } = await listen(t, (_req, res) => res.end('vivo'))
  const proc = new EventEmitter()
  let exited = false
  installLifecycleHandlers({ server, logger, proc, exit: () => { exited = true } })

  proc.emit('unhandledRejection', new Error('fallo en segundo plano'))

  assert.match(logger.messages.join('\n'), /Promesa rechazada sin capturar.*fallo en segundo plano/)
  assert.equal(exited, false)
  assert.equal(await (await fetch(url)).text(), 'vivo')
})

test('una excepción sin capturar se registra, cierra en orden y sale con código 1', async (t) => {
  const logger = silent()
  const { server } = await listen(t, (_req, res) => res.end())
  const proc = new EventEmitter()
  const { exit, exited } = trackExit()
  installLifecycleHandlers({ server, logger, proc, exit })

  proc.emit('uncaughtException', new Error('estado dudoso'))

  assert.equal(await exited, 1)
  assert.match(logger.messages.join('\n'), /Excepción sin capturar.*estado dudoso/)
  assert.equal(server.listening, false)
})
