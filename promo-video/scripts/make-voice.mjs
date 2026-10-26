// Voz en off del promo (es-MX, Dalia) con el tiempo de cada palabra para los subtítulos.
// Escribe public/voice/<id>.mp3 y src/voice.json. Uso: node scripts/make-voice.mjs
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

const VOICE = 'es-MX-DaliaNeural'
// Tono de tutorial cercano: un poco más ágil y brillante que la voz por defecto.
const PROSODY = { rate: '+8%', pitch: '+3Hz' }
export const LINES = [
  { id: 'hook', text: '¿Otra vez se perdió el papelito de una reparación?' },
  { id: 'reveal', text: 'Con TallerFlow, tu taller queda en orden.' },
  { id: 'recibe', text: 'Paso uno: recibe el equipo. Registras al cliente, su celular y la falla en segundos.' },
  { id: 'avisa', text: 'Paso dos: avisa cada avance. Cambias el estado y tu cliente recibe el aviso al instante.' },
  { id: 'cliente', text: 'Paso tres: tu cliente sigue su reparación desde el celular, sin tener que llamarte.' },
  { id: 'panel', text: 'Y en tu panel ves todo el taller: qué se repara, qué falta y cuánto cobraste.' },
  { id: 'modulos', text: 'Además: cotizaciones, garantías, inventario y reportes.' },
  { id: 'cierre', text: 'TallerFlow. Tu taller merece verse así. El link está en la bio.' },
]

const outDir = path.resolve('public/voice')
const tmp = path.resolve('scratch')
fs.mkdirSync(outDir, { recursive: true })
fs.mkdirSync(tmp, { recursive: true })

const result = {}
for (const line of LINES) {
  const tts = new MsEdgeTTS()
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, { wordBoundaryEnabled: true })
  const dir = path.join(tmp, line.id)
  fs.mkdirSync(dir, { recursive: true })
  const { audioFilePath, metadataFilePath } = await tts.toFile(dir, line.text, PROSODY)
  tts.close()
  const file = path.join(outDir, `${line.id}.mp3`)
  fs.copyFileSync(audioFilePath, file)
  const duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim())
  const words = JSON.parse(fs.readFileSync(metadataFilePath, 'utf8')).Metadata
    .filter((item) => item.Type === 'WordBoundary')
    .map((item) => ({ text: item.Data.text.Text, start: item.Data.Offset / 1e7, end: (item.Data.Offset + item.Data.Duration) / 1e7 }))
  result[line.id] = { text: line.text, duration, words }
  console.log(line.id, duration.toFixed(2), 's', words.length, 'palabras')
}
fs.writeFileSync(path.resolve('src/voice.json'), JSON.stringify(result, null, 1))
