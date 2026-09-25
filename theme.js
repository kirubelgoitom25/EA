// Shared design tokens — Duolingo-inspired: bright saturated colors,
// bold rounded shapes, and "chunky" 3D buttons (a solid darker
// bottom border instead of a blurry shadow) rather than the
// minimal black/white look used before.

export const colors = {
  // Primary green — correct answers, main CTAs, progress
  green: "#58cc02",
  greenDark: "#46a302", // bottom border / pressed state
  greenLight: "#d7ffb8",
  greenBg: "#f0ffe0",

  // Blue — XP, links, info
  blue: "#1cb0f6",
  blueDark: "#1899d6",
  blueLight: "#ddf4ff",

  // Gold — streaks, medals, rewards
  gold: "#ffc800",
  goldDark: "#e6b400",

  // Red — incorrect answers, destructive actions
  red: "#ff4b4b",
  redDark: "#ea2b2b",
  redLight: "#ffdfe0",

  // Purple — leaderboard / league accents
  purple: "#ce82ff",
  purpleDark: "#a568cc",

  // Neutrals
  text: "#3c3c3c",
  textMuted: "#777777",
  border: "#e5e5e5",
  borderDark: "#cdcdcd",
  bg: "#ffffff",
  bgMuted: "#f7f7f7",
  screenBg: "#f7f9fc",
  locked: "#e5e5e5",
  lockedDark: "#c9c9c9",
};

export const radius = {
  sm: 10,
  md: 14,
  lg: 18,
  full: 999,
};

// The "3D chunky button" effect: a solid, slightly darker bottom
// edge simulates depth (no blur/opacity shadows like the old UI).
export const chunky = (baseColor, depthColor) => ({
  backgroundColor: baseColor,
  borderBottomWidth: 4,
  borderBottomColor: depthColor,
  borderRadius: radius.md,
});
