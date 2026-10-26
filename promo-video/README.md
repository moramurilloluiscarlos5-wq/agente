# Video promocional de TallerFlow (TikTok, 1080×1920)

Video de 41 s hecho con Remotion, con los colores de TallerFlow ("Placa": verde de circuito y soldadura dorada),
voz en off en español de México, subtítulos palabra por palabra y música original.

- Ver y editar en vivo: `npm run dev` (Remotion Studio, composición `PromoTikTok`).
- Exportar el MP4: `npx remotion render PromoTikTok out/TallerFlow-promo-tiktok.mp4 --crf=18` (tarda unos 12 min).
- Voz en off (es-MX, Dalia) y tiempos por palabra: edita los textos en `scripts/make-voice.mjs` y corre `node scripts/make-voice.mjs`.
  Si cambian las duraciones, ajusta `CUTS` en `src/Promo.tsx`.
- Música original a 120 BPM: `node scripts/make-music.mjs public/music.wav 42 35` (duración, golpe final en segundos).
- Grabaciones de la app: `scripts/record-footage.spec.js` (datos de ejemplo, nunca toca la base real).

Escenas: gancho, logo, 1 Recibe, 2 Avisa, 3 Cliente, 4 Panel, módulos y cierre ("Link en la bio").
