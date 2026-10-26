import { Video } from "@remotion/media";
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { VoiceCaptions } from "../ui/fx";
import { Board, Laptop, Phone, StepTitle, useDeviceIn } from "../ui/parts";
import { C, clamp, OUT } from "../ui/theme";

// Pantalla casi cuadrada entre el título y los subtítulos: la grabación se recorta a la parte que importa.
const LAPTOP = { left: 40, top: 520, width: 1000, height: 930 } as const;
const SCREEN_H = LAPTOP.height - 28;
const SCREEN_W = LAPTOP.width - 28;

// La grabación (1280×800) se escala a la altura de la pantalla y se corre hacia la parte que importa:
// x = 0 muestra el borde izquierdo y 1 el derecho. El componente de video no admite object-fit.
const Footage = ({ src, rate, x }: { src: string; rate: number; x: number }) => {
  const width = (SCREEN_H * 1280) / 800;
  return (
    <div style={{ position: "absolute", top: 0, height: SCREEN_H, width, left: -(width - SCREEN_W) * x }}>
      <Video src={staticFile(src)} playbackRate={rate} muted style={{ width: "100%", height: "100%" }} />
    </div>
  );
};

// Cámara sobre la grabación: acerca a la parte que importa y se aleja al final.
const useCamera = (keys: number[], scales: number[], xs: number[], ys: number[]) => {
  const frame = useCurrentFrame();
  return {
    width: "100%",
    height: "100%",
    scale: String(interpolate(frame, keys, scales, { ...clamp, easing: OUT })),
    transformOrigin: `${interpolate(frame, keys, xs, clamp)}% ${interpolate(frame, keys, ys, clamp)}%`,
  } as const;
};

// Deriva 3D lenta del dispositivo durante la escena: da profundidad sin distraer.
const useDrift = (duration: number, from = -5, to = 5) => {
  const frame = useCurrentFrame();
  return { transform: `perspective(2200px) rotateY(${interpolate(frame, [0, duration], [from, to])}deg) rotateX(${interpolate(frame, [0, duration], [3, -2])}deg)` };
};

export const Receive = ({ duration }: { duration: number }) => {
  const device = useDeviceIn();
  const drift = useDrift(duration);
  const cam = useCamera([0, 34, 62, 119, 150, 210], [1, 1, 1.35, 1.35, 1.0, 1.0], [50, 50, 50, 60, 50, 50], [50, 50, 56, 72, 50, 50]);
  return (
    <Board>
      <StepTitle n={1} title="Recibe el equipo" />
      <Laptop style={{ ...LAPTOP, ...device, ...drift }}>
        <div style={cam}>
          <Footage src="footage/nueva-orden.mp4" rate={1.7} x={0.75} />
        </div>
      </Laptop>
      <VoiceCaptions id="recibe" />
    </Board>
  );
};

// Aviso que le llega al cliente cuando el equipo queda listo.
const Notification = ({ at }: { at: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - at, fps, config: { damping: 15, stiffness: 170 } });
  return (
    <div
      style={{
        position: "absolute",
        left: 90,
        right: 90,
        top: 540,
        display: "flex",
        gap: 26,
        alignItems: "center",
        padding: "30px 34px",
        borderRadius: 40,
        background: "rgba(255,255,255,0.96)",
        color: C.ink,
        boxShadow: "0 40px 90px rgba(0,0,0,0.4)",
        opacity: pop,
        translate: `0 ${interpolate(pop, [0, 1], [-160, 0])}px`,
      }}
    >
      <div style={{ width: 92, height: 92, flexShrink: 0, borderRadius: 24, background: "#22c55e", display: "grid", placeItems: "center" }}>
        <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5Z" /></svg>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 34, fontWeight: 600, color: "#5b716a" }}>Taller Centro · ahora</div>
        <div style={{ marginTop: 4, fontSize: 44, fontWeight: 800, letterSpacing: "-0.02em" }}>¡Tu iPhone 13 está listo!</div>
        <div style={{ marginTop: 2, fontSize: 36, color: "#3f5751" }}>Ya puedes pasar por él.</div>
      </div>
    </div>
  );
};

export const Progress = ({ duration }: { duration: number }) => {
  const device = useDeviceIn();
  const drift = useDrift(duration, 5, -5);
  const cam = useCamera([0, 28, 56, 140, 165, 210], [1, 1, 1.45, 1.45, 1.1, 1.1], [50, 50, 30, 30, 50, 50], [50, 50, 58, 58, 70, 70]);
  return (
    <Board>
      <StepTitle n={2} title="Avisa cada avance" />
      <Laptop style={{ ...LAPTOP, ...device, ...drift }}>
        <div style={cam}>
          <Footage src="footage/avance.mp4" rate={1.14} x={0.62} />
        </div>
      </Laptop>
      <Notification at={146} />
      <VoiceCaptions id="avisa" />
    </Board>
  );
};

export const Customer = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const device = useDeviceIn(4);
  const drift = useDrift(duration, -8, 6);
  const screenW = 484;
  const screenH = 964;
  const imageH = (screenW * 3255) / 1170;
  const chip = (at: number) => spring({ frame: frame - at, fps, config: { damping: 13, stiffness: 170 } });
  return (
    <Board>
      <StepTitle n={3} title="Tu cliente lo ve en su celular" top={120} />
      <Phone style={{ left: 280, top: 520, width: 520, height: 1000, ...device, ...drift }}>
        <Img
          src={staticFile("footage/seguimiento-full.png")}
          style={{ width: screenW, height: imageH, translate: `0 ${interpolate(frame, [40, 140], [0, -(imageH - screenH)], { ...clamp, easing: OUT })}px` }}
        />
      </Phone>
      {/* Lo que el cliente entiende de un vistazo. */}
      {[
        { text: "Listo para entregar", at: 30, top: 700, left: 24, gold: true },
        { text: "Sin llamar al taller", at: 80, top: 1240, left: 560, gold: false },
      ].map((item) => (
        <div
          key={item.text}
          style={{
            position: "absolute",
            top: item.top,
            left: item.left,
            padding: "22px 32px",
            borderRadius: 999,
            background: item.gold ? C.gold : C.white,
            color: item.gold ? C.goldInk : C.ink,
            fontSize: 42,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            boxShadow: "0 24px 50px rgba(0,0,0,0.35)",
            scale: String(chip(item.at)),
            rotate: `${item.gold ? -4 : 3}deg`,
          }}
        >
          {item.text}
        </div>
      ))}
      <VoiceCaptions id="cliente" bottom={170} />
    </Board>
  );
};

export const Overview = ({ duration }: { duration: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const device = useDeviceIn();
  const drift = useDrift(duration);
  const cam = useCamera([0, 20, 43, 90, 112, 150], [1, 1, 1.45, 1.45, 1.05, 1.05], [50, 50, 50, 50, 50, 50], [50, 50, 22, 22, 40, 40]);
  const stat = spring({ frame: frame - 58, fps, config: { damping: 14, stiffness: 160 } });
  return (
    <Board>
      <StepTitle n={4} title="Todo tu taller de un vistazo" top={120} />
      <Laptop style={{ ...LAPTOP, ...device, ...drift }}>
        <div style={cam}>
          <Footage src="footage/panel.mp4" rate={1.6} x={0.66} />
        </div>
      </Laptop>
      <div
        style={{
          position: "absolute",
          left: 330,
          right: 40,
          top: 1190,
          padding: "28px 38px",
          borderRadius: 34,
          background: C.gold,
          color: C.goldInk,
          boxShadow: "0 30px 70px rgba(0,0,0,0.4)",
          scale: String(stat),
          rotate: `${interpolate(stat, [0, 1], [-8, -3])}deg`,
        }}
      >
        <div style={{ fontSize: 36, fontWeight: 700 }}>Cobrado este mes</div>
        <div style={{ fontSize: 104, fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 1 }}>
          ${Math.round(interpolate(frame, [58, 92], [0, 48250], { ...clamp, easing: OUT })).toLocaleString("en-US")}
        </div>
      </div>
      <VoiceCaptions id="panel" />
    </Board>
  );
};
