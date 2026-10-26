// Pista original del promo: 120 BPM, la mayor parte en La menor (Am–F–C–G).
// Intro en tensión (hats + subida), caída a los 3 s junto con la revelación del logo,
// y golpe final con cola. Uso: node scripts/make-music.mjs public/music.wav <segundos> <golpe final>
import fs from 'node:fs'

const SR = 44100
const BPM = 120
const BEAT = 60 / BPM
const LENGTH = Number(process.argv[3] ?? 32) // segundos
const DROP = 3 // la caída coincide con el corte al logo (frame 90 a 30 fps)
const END_HIT = Number(process.argv[4] ?? 28) // golpe final: cuando entra el llamado a la acción
const N = Math.floor(SR * LENGTH)
const L = new Float32Array(N)
const R = new Float32Array(N)

let seed = 7
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12)
const add = (i, l, r = l) => { if (i >= 0 && i < N) { L[i] += l; R[i] += r } }

// Progresión: Am, F, C, G (una por compás de 2 s).
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]]
const chordAt = (t) => CHORDS[Math.floor(Math.max(0, t - DROP) / (BEAT * 4)) % 4]

function kick(t0, gain = 1) {
  const len = Math.floor(0.45 * SR); let phase = 0
  for (let n = 0; n < len; n++) {
    const t = n / SR
    phase += (2 * Math.PI * (45 + 120 * Math.exp(-t * 28))) / SR
    const s = Math.sin(phase) * Math.exp(-t * 7) * 0.9 * gain + (n < 90 ? rand() * 0.25 * (1 - n / 90) : 0)
    add(Math.floor(t0 * SR) + n, s)
  }
}
function clap(t0, gain = 0.45) {
  const len = Math.floor(0.25 * SR); let prev = 0
  for (let n = 0; n < len; n++) {
    const t = n / SR
    const env = Math.exp(-t * 18) + (t < 0.03 ? 0.6 * Math.exp(-((t % 0.01) * 300)) : 0)
    const x = rand(); const hp = x - prev; prev = x
    add(Math.floor(t0 * SR) + n, hp * env * gain, hp * env * gain * 0.9)
  }
}
function hat(t0, gain = 0.12, open = false) {
  const len = Math.floor((open ? 0.18 : 0.05) * SR); let prev = 0
  for (let n = 0; n < len; n++) {
    const x = rand(); const hp = x - prev; prev = x
    const s = hp * Math.exp(-(n / SR) * (open ? 18 : 70)) * gain
    add(Math.floor(t0 * SR) + n, s * 0.8, s)
  }
}
// Sierra con filtro de un polo: bajo y acordes.
function saw(t0, dur, midi, gain, cutoff, pan = 0, detune = 0) {
  const len = Math.floor(dur * SR); const f = hz(midi) * (1 + detune); let ph = 0; let lp = 0
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR)
  for (let n = 0; n < len; n++) {
    ph = (ph + f / SR) % 1
    lp += a * (ph * 2 - 1 - lp)
    const env = Math.min(1, n / 400) * Math.min(1, (len - n) / 800)
    const s = lp * env * gain
    add(Math.floor(t0 * SR) + n, s * (1 - pan), s * (1 + pan))
  }
}
function pluck(t0, midi, gain = 0.12, pan = 0) {
  const len = Math.floor(0.35 * SR); const f = hz(midi); let ph = 0
  for (let n = 0; n < len; n++) {
    ph = (ph + f / SR) % 1
    const s = (Math.sin(2 * Math.PI * ph) + 0.35 * Math.sin(4 * Math.PI * ph)) * Math.exp(-(n / SR) * 9) * gain
    add(Math.floor(t0 * SR) + n, s * (1 - pan), s * (1 + pan))
  }
}

// Intro: subida de ruido y tono hacia la caída, con hats que se aceleran.
for (let n = 0; n < DROP * SR; n++) {
  const t = n / SR; const p = t / DROP
  const s = rand() * 0.11 * p * p + Math.sin(2 * Math.PI * (220 + 660 * p * p) * t) * 0.05 * p
  add(n, s, s * 0.95)
}
for (let t = 0; t < DROP; t += BEAT / 2) hat(t, 0.06)
for (let t = DROP - BEAT * 2; t < DROP; t += BEAT / 4) hat(t, 0.08)
pluck(0, 69, 0.18); pluck(BEAT * 2, 72, 0.16); pluck(BEAT * 3, 76, 0.16)

// Cuerpo: bombo a negras, palmas en 2 y 4, hats a corcheas, bajo, acordes con bombeo y arpegio.
for (let t = DROP; t < END_HIT - 0.01; t += BEAT) {
  const beat = Math.round((t - DROP) / BEAT)
  kick(t)
  if (beat % 2 === 1) clap(t)
  hat(t + BEAT / 2, 0.11, beat % 4 === 3)
  const [root, third, fifth] = chordAt(t)
  saw(t, BEAT * 0.45, root - 24, 0.32, 260)
  saw(t + BEAT / 2, BEAT * 0.4, root - 12, 0.18, 380)
  // Acorde corto después de cada bombo (el hueco hace el efecto de bombeo).
  for (const [i, m] of [root, third, fifth].entries()) saw(t + 0.06, BEAT * 0.8, m, 0.045, 1800, [-0.5, 0, 0.5][i], i * 0.003)
  if (t >= DROP + BEAT * 8) {
    const arp = [root + 12, third + 12, fifth + 12, third + 24]
    for (let k = 0; k < 2; k++) pluck(t + k * BEAT / 2, arp[(beat * 2 + k) % 4], 0.07, k ? 0.4 : -0.4)
  }
}
// Golpe final con cola.
kick(END_HIT, 1.2); clap(END_HIT, 0.6)
for (const [i, m] of [57, 60, 64, 69].entries()) saw(END_HIT, 2.6, m, 0.06, 2200, [-0.6, -0.2, 0.2, 0.6][i])
saw(END_HIT, 2.6, 33, 0.3, 200)

// Master: saturación suave, desvanecido final y normalización a -1 dB.
let peak = 0
for (let n = 0; n < N; n++) {
  const fade = Math.min(1, (N - n) / (SR * 1.5))
  L[n] = Math.tanh(L[n] * 1.2) * fade; R[n] = Math.tanh(R[n] * 1.2) * fade
  peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]))
}
const g = 0.89 / peak
const buf = Buffer.alloc(44 + N * 4)
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8)
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24)
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(N * 4, 40)
for (let n = 0; n < N; n++) { buf.writeInt16LE(Math.round(L[n] * g * 32767), 44 + n * 4); buf.writeInt16LE(Math.round(R[n] * g * 32767), 46 + n * 4) }
fs.writeFileSync(process.argv[2] ?? 'music.wav', buf)
console.log('ok', LENGTH, 's')
