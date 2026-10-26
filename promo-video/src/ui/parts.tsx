import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, clamp, FONT, OUT } from "./theme";

// Fondo de placa: verde con la rejilla de puntos de una PCB y una luz que respira.
export const Board = ({ children, tone = "board" }: { children?: ReactNode; tone?: "board" | "night" }) => {
  const frame = useCurrentFrame();
  const base = tone === "night" ? C.boardNight : C.board;
  const deep = tone === "night" ? "#020f0b" : C.boardDeep;
  return (
    <AbsoluteFill style={{ backgroundColor: base, fontFamily: FONT, color: C.white, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 70% at 50% ${interpolate(frame, [0, 300], [30, 45], clamp)}%, rgba(255,255,255,0.10), transparent 60%), radial-gradient(90% 60% at 50% 110%, ${deep}, transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.09) 2.5px, transparent 3px)",
          backgroundSize: "54px 54px",
          backgroundPosition: `${interpolate(frame, [0, 600], [0, -54])}px 0px`,
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

// Número de paso como punto de soldadura dorado y el título que entra palabra por palabra.
export const StepTitle = ({ n, title, top = 150 }: { n: number; title: string; top?: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pad = spring({ frame, fps, config: { damping: 14, stiffness: 180 } });
  const words = title.split(" ");
  return (
    <div style={{ position: "absolute", top, left: 90, right: 90 }}>
      <div
        style={{
          width: 96,
          height: 96,
          borderRadius: 999,
          background: C.gold,
          color: C.goldInk,
          display: "grid",
          placeItems: "center",
          fontSize: 56,
          fontWeight: 900,
          boxShadow: `0 0 0 10px rgba(230,182,46,0.22), 0 0 40px rgba(230,182,46,${0.55 * pad})`,
          scale: String(pad),
        }}
      >
        {n}
      </div>
      <h1 style={{ margin: "34px 0 0", fontSize: 104, fontWeight: 850, lineHeight: 0.98, letterSpacing: "-0.04em" }}>
        {words.map((word, i) => (
          <span
            key={i}
            style={{
              display: "inline-block",
              marginRight: "0.22em",
              opacity: interpolate(frame, [4 + i * 3, 12 + i * 3], [0, 1], clamp),
              translate: `0 ${interpolate(frame, [4 + i * 3, 16 + i * 3], [60, 0], { ...clamp, easing: OUT })}px`,
            }}
          >
            {word}
          </span>
        ))}
      </h1>
    </div>
  );
};

// Pie de escena: frase corta en una pastilla blanca.
export const Caption = ({ text, at = 18, bottom = 190 }: { text: string; at?: number; bottom?: number }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: 90, right: 90, bottom, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          padding: "26px 40px",
          borderRadius: 28,
          background: C.white,
          color: C.ink,
          fontSize: 48,
          fontWeight: 700,
          lineHeight: 1.18,
          textAlign: "center",
          letterSpacing: "-0.02em",
          boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
          opacity: interpolate(frame, [at, at + 8], [0, 1], clamp),
          translate: `0 ${interpolate(frame, [at, at + 14], [40, 0], { ...clamp, easing: OUT })}px`,
        }}
      >
        {text}
      </div>
    </div>
  );
};

// Marco de computadora para las grabaciones de escritorio (1280×800).
export const Laptop = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      position: "absolute",
      borderRadius: 26,
      padding: 14,
      background: "linear-gradient(180deg, #1d2a26, #0b1411)",
      boxShadow: "0 50px 110px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
      ...style,
    }}
  >
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 14, width: "100%", height: "100%", background: "#fff" }}>{children}</div>
  </div>
);

// Marco de celular para las capturas móviles.
export const Phone = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      position: "absolute",
      borderRadius: 78,
      padding: 18,
      background: "linear-gradient(160deg, #24332e, #0a120f)",
      boxShadow: "0 60px 120px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.18)",
      ...style,
    }}
  >
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 62, width: "100%", height: "100%", background: "#fff" }}>
      {children}
      <div style={{ position: "absolute", top: 18, left: "50%", width: 150, height: 40, marginLeft: -75, borderRadius: 999, background: "#05090a" }} />
    </div>
  </div>
);

// Entrada del dispositivo: sube y se endereza desde un ligero giro 3D.
export const useDeviceIn = (delay = 6) => {
  const frame = useCurrentFrame();
  return {
    opacity: interpolate(frame, [delay, delay + 8], [0, 1], clamp),
    translate: `0 ${interpolate(frame, [delay, delay + 22], [220, 0], { ...clamp, easing: OUT })}px`,
    rotate: `${interpolate(frame, [delay, delay + 22], [6, 0], { ...clamp, easing: OUT })}deg`,
  } as const;
};

export const ease = Easing.bezier(0.45, 0, 0.2, 1);
