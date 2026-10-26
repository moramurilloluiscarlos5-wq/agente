import { loadFont } from "@remotion/fonts";
import { Easing, staticFile } from "remotion";

// Identidad "Placa" de TallerFlow: verde de tarjeta de circuito, soldadura dorada y blanco.
export const C = {
  board: "#0e6b55",
  boardDeep: "#073d30",
  boardNight: "#04211a",
  gold: "#e6b62e",
  goldInk: "#2a1d00",
  white: "#ffffff",
  mist: "rgba(255,255,255,0.72)",
  ink: "#0f1f1a",
};

export const FONT = "Schibsted Grotesk";
loadFont({ family: FONT, url: staticFile("fonts/SchibstedGrotesk.ttf"), weight: "400 900" });

// Curvas de toda la pieza: entrada rápida que se asienta, sin rebotes de caricatura.
export const OUT = Easing.bezier(0.16, 1, 0.3, 1);
export const SNAP = Easing.bezier(0.7, 0, 0.2, 1);
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
