import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { LogoMark } from "../ui/Logo";
import { wordAt } from "../ui/fx";
import { Board } from "../ui/parts";
import { C, clamp, OUT } from "../ui/theme";

// Pistas de cobre que corren desde los bordes hasta el logo, cada una con su punto de soldadura.
const TRACES = [
  "M -20 520 H 260 L 380 640 H 540 V 760",
  "M 1100 430 H 820 L 700 550 V 760",
  "M -20 1240 H 220 L 360 1100 H 540 V 1060",
  "M 1100 1300 H 860 L 720 1160 V 1060",
  "M 540 -20 V 300 L 470 370 V 760",
  "M 540 1940 V 1700 L 470 1630",
];

export const Reveal = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 4, fps, config: { damping: 12, stiffness: 160 } });
  const brand = Math.round(wordAt("reveal", 1) * fps);
  const tagline = Math.round(wordAt("reveal", 2) * fps);
  return (
    <Board>
      <svg width={1080} height={1920} style={{ position: "absolute", inset: 0 }}>
        {TRACES.map((d, i) => {
          const draw = interpolate(frame, [i * 2, 20 + i * 2], [1, 0], { ...clamp, easing: OUT });
          return (
            <g key={d}>
              <path d={d} stroke="rgba(255,255,255,0.10)" strokeWidth={22} fill="none" strokeLinecap="round" />
              <path d={d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={draw} stroke={C.gold} strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
        {[[540, 760], [540, 1060], [700, 760], [720, 1060], [380, 640], [360, 1100]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={interpolate(frame, [16 + i, 24 + i], [0, 14], { ...clamp, easing: OUT })} fill={C.gold} stroke={C.boardDeep} strokeWidth={5} />
        ))}
      </svg>

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ scale: String(pop), rotate: `${interpolate(pop, [0, 1], [-18, 0])}deg`, filter: `drop-shadow(0 0 ${60 * pop}px rgba(230,182,46,0.45))` }}>
          <LogoMark size={300} />
        </div>
      </AbsoluteFill>

      <div style={{ position: "absolute", top: 1330, left: 0, right: 0, textAlign: "center" }}>
        <div
          style={{
            fontSize: 132,
            fontWeight: 900,
            letterSpacing: "-0.05em",
            opacity: interpolate(frame, [brand, brand + 6], [0, 1], clamp),
            translate: `0 ${interpolate(frame, [brand, brand + 14], [50, 0], { ...clamp, easing: OUT })}px`,
          }}
        >
          TallerFlow
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: 56,
            fontWeight: 600,
            color: C.mist,
            opacity: interpolate(frame, [tagline, tagline + 8], [0, 1], clamp),
          }}
        >
          Tu taller queda en orden.
        </div>
      </div>
    </Board>
  );
};
