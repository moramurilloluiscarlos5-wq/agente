import { Audio } from "@remotion/media";
import { AbsoluteFill, interpolate, Sequence, staticFile, useVideoConfig } from "remotion";
import voice from "./voice.json";
import { FilmFinish, LightSweep, ProgressBar, SceneWrap, VOICE_DELAY } from "./ui/fx";
import { Hook } from "./scenes/Hook";
import { Reveal } from "./scenes/Reveal";
import { Customer, Overview, Progress, Receive } from "./scenes/Steps";
import { CallToAction, Montage } from "./scenes/Finale";

// Cortes en cuadros (30 fps). Cada escena dura lo que su narración, ajustado al pulso de la música
// (120 BPM = 15 cuadros); la música cae a los 90 y da el golpe final a los 1050, cuando entra el cierre.
const CUTS = { hook: 0, reveal: 90, recibe: 180, avisa: 390, cliente: 600, panel: 765, modulos: 915, cierre: 1050, end: 1230 };
type Scene = keyof typeof voice;
const ORDER: Scene[] = ["hook", "reveal", "recibe", "avisa", "cliente", "panel", "modulos", "cierre"];
const span = (scene: Scene) => {
  const next = ORDER[ORDER.indexOf(scene) + 1];
  return (next ? CUTS[next] : CUTS.end) - CUTS[scene];
};

export const Promo = () => {
  const { fps } = useVideoConfig();
  // Mientras habla la voz, la música baja para que se entienda cada palabra.
  const speaking = ORDER.map((scene) => [CUTS[scene] + VOICE_DELAY * fps, CUTS[scene] + (VOICE_DELAY + voice[scene].words.at(-1)!.end) * fps] as const);
  const musicVolume = (f: number) => {
    const duck = Math.max(...speaking.map(([a, b]) => interpolate(f, [a - 6, a, b, b + 8], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })));
    return interpolate(f, [0, 6], [0, 0.9], { extrapolateRight: "clamp" }) * (1 - 0.68 * duck);
  };

  return (
    <AbsoluteFill style={{ backgroundColor: "#04211a" }}>
      <Sequence name="Gancho" from={CUTS.hook} durationInFrames={span("hook")}><SceneWrap duration={span("hook")}><Hook /></SceneWrap></Sequence>
      <Sequence name="Marca" from={CUTS.reveal} durationInFrames={span("reveal")}><SceneWrap duration={span("reveal")}><Reveal /></SceneWrap></Sequence>
      <Sequence name="1 Recibe" from={CUTS.recibe} durationInFrames={span("recibe")}><SceneWrap duration={span("recibe")}><Receive duration={span("recibe")} /></SceneWrap></Sequence>
      <Sequence name="2 Avisa" from={CUTS.avisa} durationInFrames={span("avisa")}><SceneWrap duration={span("avisa")}><Progress duration={span("avisa")} /></SceneWrap></Sequence>
      <Sequence name="3 Cliente" from={CUTS.cliente} durationInFrames={span("cliente")}><SceneWrap duration={span("cliente")}><Customer duration={span("cliente")} /></SceneWrap></Sequence>
      <Sequence name="4 Panel" from={CUTS.panel} durationInFrames={span("panel")}><SceneWrap duration={span("panel")}><Overview duration={span("panel")} /></SceneWrap></Sequence>
      <Sequence name="Módulos" from={CUTS.modulos} durationInFrames={span("modulos")}><SceneWrap duration={span("modulos")}><Montage /></SceneWrap></Sequence>
      <Sequence name="Cierre" from={CUTS.cierre} durationInFrames={span("cierre")}><SceneWrap duration={span("cierre") + 30}><CallToAction /></SceneWrap></Sequence>

      {ORDER.slice(1).map((scene) => <LightSweep key={scene} at={CUTS[scene]} />)}
      <FilmFinish />
      <ProgressBar />

      {/* Voz en off: una pista por escena, con la primera palabra al décimo de segundo del corte. */}
      {ORDER.map((scene) => (
        <Sequence key={scene} name={`Voz ${scene}`} from={CUTS[scene] + VOICE_DELAY * fps} durationInFrames={Math.ceil(voice[scene].duration * fps)}>
          <Audio src={staticFile(`voice/${scene}.mp3`)} volume={1.15} />
        </Sequence>
      ))}

      <Audio src={staticFile("music.wav")} volume={musicVolume} />

      {[6, 19, 31, 51].map((at) => (
        <Sequence key={at} name={`SFX frase ${at}`} from={at} durationInFrames={30}><Audio src={staticFile("sfx/whip.wav")} volume={0.35} /></Sequence>
      ))}
      <Sequence name="SFX papel" from={62} durationInFrames={30}><Audio src={staticFile("sfx/page-turn.wav")} volume={0.6} /></Sequence>
      {ORDER.slice(1).map((scene) => (
        <Sequence key={scene} name={`SFX corte ${scene}`} from={CUTS[scene] - 5} durationInFrames={30}><Audio src={staticFile("sfx/whoosh.wav")} volume={0.5} /></Sequence>
      ))}
      <Sequence name="SFX logo" from={CUTS.reveal + 6} durationInFrames={60}><Audio src={staticFile("sfx/ding.wav")} volume={0.25} /></Sequence>
      <Sequence name="SFX guardar" from={CUTS.recibe + 158} durationInFrames={20}><Audio src={staticFile("sfx/mouse-click.wav")} volume={0.5} /></Sequence>
      <Sequence name="SFX aviso" from={CUTS.avisa + 146} durationInFrames={40}><Audio src={staticFile("sfx/switch.wav")} volume={0.6} /></Sequence>
      <Sequence name="SFX cobro" from={CUTS.panel + 58} durationInFrames={60}><Audio src={staticFile("sfx/ding.wav")} volume={0.22} /></Sequence>
      {[1, 2, 3, 5].map((word) => (
        <Sequence key={word} name={`SFX módulo ${word}`} from={CUTS.modulos + Math.round((VOICE_DELAY + voice.modulos.words[word].start) * fps)} durationInFrames={20}>
          <Audio src={staticFile("sfx/shutter-modern.wav")} volume={0.3} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
