import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import voice from "../voice.json";
import { C, clamp, FONT, OUT } from "./theme";

type VoiceId = keyof typeof voice;
export const VOICE_DELAY = 0.1; // segundos entre el corte y la primera palabra

// Corte "whip": la escena entra con zoom y desenfoque que se asientan, y sale acelerando hacia la cámara.
export const SceneWrap = ({ children, duration }: { children: ReactNode; duration: number }) => {
  const frame = useCurrentFrame();
  const inP = interpolate(frame, [0, 9], [0, 1], { ...clamp, easing: OUT });
  const outP = interpolate(frame, [duration - 6, duration], [0, 1], clamp);
  return (
    <AbsoluteFill
      style={{
        scale: String(interpolate(inP, [0, 1], [1.18, 1]) * interpolate(outP, [0, 1], [1, 1.22])),
        filter: `blur(${interpolate(inP, [0, 1], [14, 0]) + interpolate(outP, [0, 1], [0, 16])}px)`,
        opacity: interpolate(inP, [0, 1], [0.4, 1]),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

// Luz dorada que barre la pantalla en cada corte.
export const LightSweep = ({ at }: { at: number }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at - 4, at + 10], [0, 1], clamp);
  if (p <= 0 || p >= 1) return null;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        mixBlendMode: "screen",
        opacity: Math.sin(p * Math.PI) * 0.9,
        background: `linear-gradient(115deg, transparent ${p * 120 - 40}%, rgba(255,214,120,0.85) ${p * 120 - 15}%, rgba(255,255,255,0.9) ${p * 120 - 8}%, transparent ${p * 120 + 10}%)`,
      }}
    />
  );
};

// Acabado de cine: grano que cambia cada cuadro y viñeta suave.
export const FilmFinish = () => {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 2);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill style={{ background: "radial-gradient(120% 85% at 50% 45%, transparent 55%, rgba(0,0,0,0.45) 100%)" }} />
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.09, mixBlendMode: "overlay" }}>
        <filter id={`grain-${seed}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={Math.round(random(seed) * 1000)} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${seed})`} />
      </svg>
    </AbsoluteFill>
  );
};

// Barra de avance arriba, como en los reels: dice cuánto falta y retiene la mirada.
export const ProgressBar = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <div style={{ position: "absolute", top: 44, left: 60, right: 60, height: 8, borderRadius: 999, background: "rgba(255,255,255,0.18)", overflow: "hidden" }}>
      <div style={{ width: `${(frame / durationInFrames) * 100}%`, height: "100%", borderRadius: 999, background: C.gold, boxShadow: `0 0 16px ${C.gold}` }} />
    </div>
  );
};

// Subtítulos estilo TikTok: frases de hasta tres palabras que se cortan donde la voz respira;
// la palabra que se dice se pinta de dorado.
const chunksOf = (id: VoiceId) => {
  const chunks: { words: (typeof voice)[VoiceId]["words"] }[] = [];
  for (const word of voice[id].words) {
    const last = chunks.at(-1);
    const prev = last?.words.at(-1);
    if (!last || !prev || last.words.length >= 3 || word.start - prev.end > 0.18) chunks.push({ words: [word] });
    else last.words.push(word);
  }
  return chunks;
};

export const VoiceCaptions = ({ id, bottom = 200 }: { id: VoiceId; bottom?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps - VOICE_DELAY;
  const chunks = chunksOf(id);
  const index = chunks.findLastIndex((chunk) => t >= chunk.words[0].start - 0.08);
  if (index < 0) return null;
  const chunk = chunks[index];
  const endOfLine = chunk.words.at(-1)!.end;
  if (index === chunks.length - 1 && t > endOfLine + 0.6) return null;
  const since = t - (chunk.words[0].start - 0.08);
  return (
    <div style={{ position: "absolute", left: 70, right: 70, bottom, display: "flex", justifyContent: "center", fontFamily: FONT }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "0 0.28em",
          fontSize: 78,
          fontWeight: 900,
          letterSpacing: "-0.03em",
          lineHeight: 1.08,
          textAlign: "center",
          scale: String(interpolate(since, [0, 0.12], [0.86, 1], { ...clamp, easing: OUT })),
          opacity: interpolate(since, [0, 0.06], [0, 1], clamp),
        }}
      >
        {chunk.words.map((word) => {
          const spoken = t >= word.start;
          return (
            <span
              key={word.start}
              style={{
                color: spoken ? C.gold : C.white,
                textShadow: "0 6px 0 rgba(4,33,26,0.9), 0 0 28px rgba(0,0,0,0.55)",
                WebkitTextStroke: "3px rgba(4,33,26,0.85)",
                paintOrder: "stroke fill",
                translate: `0 ${spoken ? interpolate(t - word.start, [0, 0.1], [-8, 0], clamp) : 0}px`,
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

// Momento en que se dice una palabra (segundos desde el inicio de la escena).
export const wordAt = (id: VoiceId, index: number) => VOICE_DELAY + voice[id].words[index].start;
