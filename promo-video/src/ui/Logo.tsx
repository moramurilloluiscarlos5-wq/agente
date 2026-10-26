import type { CSSProperties } from "react";

// Mismo símbolo que la app: T blanca sobre la placa y F dorada.
export const LogoMark = ({ size = 200, style }: { size?: number; style?: CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={style}>
    <rect x="1" y="1" width="98" height="98" rx="24" fill="#0b5a47" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="2" />
    <path d="M19.2 29h57.4L71 41.7H53.5v36.9H39.4V41.7H19.2V29Z" fill="#ffffff" />
    <path d="M19.2 45.6h14.6v4.5h-7.3l-7.3-4.5Z" fill="#e6b62e" />
    <path d="M60.6 48.2h22.8l-5.6 9.5h-7.7v7.7h8.5l-4.5 10.1H60.6V48.2Z" fill="#e6b62e" />
  </svg>
);
