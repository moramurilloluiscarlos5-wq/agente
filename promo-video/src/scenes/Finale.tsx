import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { wordAt } from "../ui/fx";
import { LogoMark } from "../ui/Logo";
import { Board } from "../ui/parts";
import { C, clamp, OUT } from "../ui/theme";

// Ráfaga de módulos: cada uno entra cuando la voz lo nombra, con la pantalla real detrás.
const FLASHES = [
  { word: "Cotizaciones", spoken: 1, image: "footage/detalle.png", x: 70, y: 30 },
  { word: "Garantías", spoken: 2, image: "footage/reparaciones.png", x: 60, y: 40 },
  { word: "Inventario", spoken: 3, image: "footage/menu-celular.png", x: 50, y: 30 },
  { word: "Reportes", spoken: 5, image: "footage/panel.png", x: 60, y: 25 },
];

export const Montage = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const starts = FLASHES.map((item) => Math.round(wordAt("modulos", item.spoken) * fps));
  const index = starts.findLastIndex((start) => frame >= start);
  const item = index >= 0 ? FLASHES[index] : null;
  const local = index >= 0 ? frame - starts[index] : frame;
  return (
    <Board>
      {item && (
        <Img
          src={staticFile(item.image)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: `${item.x}% ${item.y}%`,
            scale: String(interpolate(local, [0, 40], [1.3, 1.1], { ...clamp, easing: OUT })),
            filter: `blur(${interpolate(local, [0, 5], [10, 0], clamp)}px)`,
          }}
        />
      )}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(4,33,26,0.5), rgba(4,33,26,0.9))" }} />
      {/* Cuatro puntos de soldadura: se encienden conforme se nombra cada módulo. */}
      <div style={{ position: "absolute", top: 560, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 34 }}>
        {FLASHES.map((flash, i) => (
          <div key={flash.word} style={{ width: 26, height: 26, borderRadius: 999, background: i <= index ? C.gold : "rgba(255,255,255,0.22)", boxShadow: i <= index ? `0 0 20px ${C.gold}` : "none" }} />
        ))}
      </div>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 56, fontWeight: 800, color: C.gold, opacity: interpolate(frame, [0, 6], [0, 1], clamp) }}>Además</div>
        {item && (
          <div
            key={item.word}
            style={{
              marginTop: 10,
              fontSize: 150,
              fontWeight: 900,
              letterSpacing: "-0.05em",
              scale: String(interpolate(local, [0, 6], [1.4, 1], { ...clamp, easing: OUT })),
              opacity: interpolate(local, [0, 3], [0, 1], clamp),
            }}
          >
            {item.word}
          </div>
        )}
      </AbsoluteFill>
    </Board>
  );
};

export const CallToAction = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const headline = Math.round(wordAt("cierre", 1) * fps);
  const button = Math.round(wordAt("cierre", 6) * fps);
  const pop = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });
  const pulse = frame > button + 10 ? 1 + 0.04 * Math.sin(((frame - button) / fps) * Math.PI * 4) : 1;
  return (
    <Board>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 330 }}>
        <div style={{ scale: String(pop), filter: "drop-shadow(0 0 50px rgba(230,182,46,0.45))" }}>
          <LogoMark size={230} />
        </div>
        <div style={{ marginTop: 26, fontSize: 92, fontWeight: 900, letterSpacing: "-0.05em", opacity: interpolate(frame, [4, 12], [0, 1], clamp) }}>TallerFlow</div>
        <div
          style={{
            marginTop: 70,
            padding: "0 90px",
            textAlign: "center",
            fontSize: 124,
            fontWeight: 900,
            lineHeight: 0.98,
            letterSpacing: "-0.05em",
            opacity: interpolate(frame, [headline, headline + 8], [0, 1], clamp),
            translate: `0 ${interpolate(frame, [headline, headline + 16], [60, 0], { ...clamp, easing: OUT })}px`,
          }}
        >
          Tu taller merece verse así.
        </div>
        <div
          style={{
            marginTop: 90,
            padding: "36px 70px",
            borderRadius: 999,
            background: C.gold,
            color: C.goldInk,
            fontSize: 64,
            fontWeight: 900,
            letterSpacing: "-0.02em",
            boxShadow: "0 0 0 14px rgba(230,182,46,0.2), 0 30px 70px rgba(0,0,0,0.35)",
            opacity: interpolate(frame, [button, button + 6], [0, 1], clamp),
            scale: String(interpolate(frame, [button, button + 10], [0.6, 1], { ...clamp, easing: OUT }) * pulse),
          }}
        >
          Link en la bio
        </div>
      </AbsoluteFill>
    </Board>
  );
};
