import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { wordAt } from "../ui/fx";
import { Board } from "../ui/parts";
import { C, clamp, OUT, SNAP } from "../ui/theme";

// Cada frase cae de golpe justo cuando la voz la dice (índice de la palabra que la abre).
const LINES = [
  { text: "¿Otra vez", word: 0, size: 150 },
  { text: "se perdió", word: 2, size: 150 },
  { text: "el papelito", word: 4, size: 150, gold: true },
  { text: "de una reparación?", word: 6, size: 84 },
];

// Gancho: el problema que todo taller conoce. El papelito de la orden se va volando.
export const Hook = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <Board tone="night">
      <div
        style={{
          position: "absolute",
          left: 250,
          top: 1120,
          width: 580,
          padding: "40px 44px",
          background: "#fbf7ec",
          borderRadius: 10,
          boxShadow: "0 30px 60px rgba(0,0,0,0.45)",
          color: "#3a3328",
          fontSize: 48,
          fontStyle: "italic",
          lineHeight: 1.5,
          opacity: interpolate(frame, [10, 16], [0, 1], clamp),
          rotate: `${interpolate(frame, [10, 62, 88], [-4, -9, 70], { ...clamp, easing: SNAP })}deg`,
          translate: `${interpolate(frame, [62, 88], [0, 900], { ...clamp, easing: SNAP })}px ${interpolate(frame, [10, 22, 62, 88], [260, 0, -20, -500], { ...clamp, easing: OUT })}px`,
        }}
      >
        <div style={{ borderBottom: "2px dashed #c9bfa8", paddingBottom: 12, fontWeight: 700, fontStyle: "normal" }}>Orden #??</div>
        <div style={{ marginTop: 14 }}>iPhone… ¿pantalla?</div>
        <div>Tel. 614 55_ __</div>
        <div style={{ textDecoration: "line-through", opacity: 0.7 }}>$1,500 $1,850</div>
      </div>

      <AbsoluteFill style={{ padding: "300px 90px 0" }}>
        {LINES.map((line) => {
          const at = Math.round(wordAt("hook", line.word) * fps);
          return (
            <div
              key={line.text}
              style={{
                fontSize: line.size,
                fontWeight: 900,
                lineHeight: 1.0,
                letterSpacing: "-0.045em",
                marginTop: line.size < 100 ? 20 : 0,
                color: line.gold ? C.gold : C.white,
                opacity: interpolate(frame, [at, at + 3], [0, 1], clamp),
                scale: String(interpolate(frame, [at, at + 7], [1.7, 1], { ...clamp, easing: OUT })),
                translate: `${interpolate(frame, [at + 5, at + 7, at + 9, at + 11], [0, -10, 8, 0], clamp)}px 0`,
                transformOrigin: "left center",
              }}
            >
              {line.text}
            </div>
          );
        })}
      </AbsoluteFill>
    </Board>
  );
};
