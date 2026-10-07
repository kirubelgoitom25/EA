// Same theme shape as student-app/theme.js, so a theme picker can be added later.
const baseColors = {
  text: "#24201E",
  textSecondary: "#756C67",
  textMuted: "#A69D97",
  card: "#FFFFFF",
  yellow: "#FFC857",
  yellowDeep: "#E0A82C",
  mint: "#42C98A",
  red: "#EF5350",
  redLight: "#FDEAEA",
  redDark: "#D84E4E",
};

export const themes = [
  {
    id: "emerald",
    name: "Emerald",
    primary: "#1B8556",
    deep: "#12684A",
    light: "#E8F6EF",
    soft: "#CFEBDD",
    bg: "#F5FBF8",
    bgAlt: "#EAF6F0",
    border: "#DCEBE3",
    borderStrong: "#C6DDD2",
    shadow: "#CFE2D8",
  },
  {
    id: "peach",
    name: "Peach",
    primary: "#FF7A45",
    deep: "#E85D2A",
    light: "#FFF0E8",
    soft: "#FFE7D8",
    bg: "#FFF9F5",
    bgAlt: "#FFF3EC",
    border: "#EEE5DF",
    borderStrong: "#E1D6CF",
    shadow: "#E9DED6",
  },
];

export const DEFAULT_THEME_ID = "emerald";

const toKebab = (s) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());

// Writes the chosen theme as CSS variables (--primary, --deep, --bg-alt, ...) on <html>.
export function applyTheme(id = DEFAULT_THEME_ID) {
  const theme = themes.find((t) => t.id === id) || themes[0];
  const vars = {
    ...baseColors,
    primary: theme.primary,
    deep: theme.deep,
    light: theme.light,
    soft: theme.soft,
    bg: theme.bg,
    bgAlt: theme.bgAlt,
    border: theme.border,
    borderStrong: theme.borderStrong,
    shadow: theme.shadow,
  };
  const root = document.documentElement;
  Object.entries(vars).forEach(([key, value]) => {
    root.style.setProperty("--" + toKebab(key), value);
  });
}
