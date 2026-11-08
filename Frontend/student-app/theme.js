import React, { createContext, useContext } from "react";

// EA's look: "Ember Trail" — learning as a trail through the fox's world.
//
// - Ground is light (#FAFBFB — exactly the fox artwork's background, so the
//   fox only ever sits on `bg`).
// - Ember (the fox's orange) is the main action colour. Text on it is dark
//   ink: white on ember fails contrast.
// - The Tail (orange → magenta, the fox's tail) is reserved for progress,
//   streaks and rewards. Never for buttons or decoration.
// - Plum is the one deep surface, used once per screen at most (Home's
//   Continue card).
// - Fern / clay are for answer feedback only.
export const tokens = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",

  text: "#27372F", // deep green-grey ink
  textSecondary: "#5F6F66",
  textTertiary: "#7A8680", // placeholders and disabled states only

  divider: "#E5E5E5",
  neutralTint: "#EFEFEF", // empty stones, tracks
  mist: "#EEF5F1", // notes and explanations

  accent: "#5E9C7D", // sage
  accentPressed: "#4F8B6E",
  accentText: "#3B6E54", // small green text and links
  accentTint: "#E4F1E9",
  onAccent: "#FFFFFF",
  onAccentStrong: "#FFFFFF", // primary button label
  accentLip: "#467F62", // the raised bottom edge of solid sage
  flame: "#F2720C", // the streak flame stays orange
  buttonFace: "#E4F1E9", // avatar face: pale sage
  buttonFacePressed: "#D5E8DD",
  buttonLip: "#BFD9CB",
  buttonInk: "#27372F",

  tailStart: "#84B89B",
  tailMid: "#5E9C7D",
  tailEnd: "#467F62",

  plum: "#2B1A38",
  plumHill: "#4E3060",
  plumSky: "#3A2448",
  plumTrack: "#46305A",
  onPlum: "#FFF7EE",
  onPlumSecondary: "#CDBFD6",

  correct: "#1A7A50", // fern
  correctTint: "#E6F4EC",
  wrong: "#C2412D", // clay — borders and icons
  wrongText: "#A8361F", // clay for text (contrast)
  wrongTint: "#FBEAE6",
};

// The path screens (Home, a course, a chapter) are neutral: warm off-white ground, stone rocks, and
// colour only where it means something: moss for what is done, ember for where you are.
export const stone = {
  bg: "#FFFFFF",
  dot: "#F0F0F0", // (the dot grid is no longer drawn)
  line: "#DCDCDC", // the dotted path ahead
  moss: "#84B89B", // the dotted path you have travelled
  mossEdge: "#84B89B",
  mossLight: "#A9D3BC",
  rock: "#EFEFEF", // a tile still ahead
  rockEdge: "#DCDCDC",
  rockLight: "#EFEFEF",
  rockInk: "#8A8A8A",
  // domes (a part's end, and the den)
  den: "#5E9C7D",
  denEdge: "#467F62",
  denLight: "#A9D3BC",
  denOff: "#E4E4E4",
  denOffEdge: "#CFCFCF",
  denOffLight: "#F3F3F3",
  denOffDoor: "#9A9A9A",
  here: "#5E9C7D", // the tile you are on
  hereEdge: "#467F62",
};

// The three levels of a course, each a shade of green (see the level-1/2/3 reference pages):
// the course page on white, the chapter page with a pale green header panel, and the lesson and
// practice screens on a soft green ground. label: the small "COURSE" / "CHAPTER 3" / stage words
// (5.5:1 on white, 4.9:1 on the panel, 5.1:1 on the lesson ground).
export const level = {
  label: "#3F7359",
  panel: "#EAF4EE", // chapter page header
  panelRadius: 28,
  barTrack: "#D3E7DA",
  barFill: "#5E9C7D",
  lessonBg: "#F2F7F4", // lesson and practice screens
  segmentDone: "#5E9C7D",
  segmentNow: "#A9D3BC",
  segmentAhead: "#DFE7E2",
  card: "#D6E3DA", // answer cards: border and bottom edge
  cardRadius: 20,
  blank: "#DFEBE3", // the gap in a sentence
};

// The small level words: 12 dp, extra bold, letter-spaced.
export const levelLabel = { fontFamily: "PlusJakartaSans_800ExtraBold", fontSize: 12, lineHeight: 16, letterSpacing: 1, color: level.label };

// The Tail as gradient stops (for expo-linear-gradient / SVG).
export const TAIL = [tokens.tailStart, tokens.tailMid, tokens.tailEnd];

// Colour at position t (0..1) along the Tail — for segmented progress.
export function tailAt(t) {
  const clamp = Math.max(0, Math.min(1, t));
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = clamp < 0.5 ? [tokens.tailStart, tokens.tailMid] : [tokens.tailMid, tokens.tailEnd];
  const local = clamp < 0.5 ? clamp * 2 : (clamp - 0.5) * 2;
  const ca = hex(a);
  const cb = hex(b);
  const mix = ca.map((v, i) => Math.round(v + (cb[i] - v) * local));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Custom fonts carry their weight in the family name, so never set
// fontWeight next to these (Android would fall back to the system font).
export const fonts = {
  regular: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_700Bold",
  display: "PlusJakartaSans_800ExtraBold",
};

export const type = {
  hero: { fontFamily: fonts.display, fontSize: 64, lineHeight: 68, letterSpacing: -1.5 },
  display: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, letterSpacing: -0.6 },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  answer: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 1.2 },
};

// 4-pt spacing scale
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
};

export const layout = {
  gutter: space.xl,
  buttonHeight: 56,
  radius: 16, // buttons
  tileRadius: 24, // answer tiles, cards
  stoneRadius: 26,
};

// Durations in ms. Motion is for answer feedback and progress only.
export const motion = {
  fast: 150,
  base: 250,
};

// ---------- Legacy names ----------
// Screens that haven't been redesigned yet still read these names. They
// all point at the EA palette, so those screens follow the brand without
// changes. New code should use `tokens`.
export const colors = {
  orange: tokens.accent,
  orangeDeep: tokens.accentPressed,
  orangeLight: tokens.accentTint,
  orangeSoft: tokens.accentTint,

  green: tokens.accent,
  greenDark: tokens.accentPressed,
  greenLight: tokens.accentTint,
  greenBg: tokens.accentTint,

  bg: tokens.bg,
  screenBg: tokens.bg,
  bgSecondary: tokens.neutralTint,
  bgMuted: tokens.neutralTint,
  card: tokens.surface,
  border: tokens.divider,
  borderStrong: tokens.divider,
  shadow: tokens.divider,

  text: tokens.text,
  textSecondary: tokens.textSecondary,
  textMuted: tokens.textTertiary,

  correct: tokens.correct,
  correctBg: tokens.correctTint,
  correctDark: tokens.correct,
  mint: tokens.correct,
  mintLight: tokens.correctTint,

  red: tokens.wrong,
  redDark: tokens.wrongText,
  redLight: tokens.wrongTint,
  redLightAlt: tokens.wrongTint,

  yellow: tokens.accent,
  yellowDeep: tokens.accentPressed,
  gold: tokens.accent,
  goldDark: tokens.accentPressed,

  blue: tokens.textSecondary,
  blueDark: tokens.text,
  blueLight: tokens.neutralTint,
  blueLightAlt: tokens.neutralTint,

  purple: tokens.plumHill,
  purpleDark: tokens.plum,

  locked: tokens.divider,
  lockedDark: tokens.textTertiary,
};

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  full: 999,
};

// ---------- Provider ----------

const theme = { colors, tokens };
const ThemeContext = createContext(theme);

export function ThemeProvider({ children }) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
