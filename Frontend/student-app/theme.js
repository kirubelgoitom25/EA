import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "app_theme_id";
export const DEFAULT_THEME_ID = "peach";

// Everything that does NOT change between themes (feedback colors, text,
// locked states, etc.). Only the brand + background keys are overridden.
const baseColors = {
  yellow: "#FFC857",
  yellowDeep: "#E0A82C",

  mint: "#42C98A",
  mintLight: "#EAFBF3",

  blue: "#5B8DEF",
  blueLight: "#EDF3FF",

  red: "#EF5350",
  redLight: "#FDEAEA",

  purple: "#B98CFF",
  purpleDark: "#9A74E8",

  text: "#24201E",
  textSecondary: "#756C67",
  textMuted: "#A69D97",
  card: "#FFFFFF",

  // Quiz feedback: real green for correct answers (never themed)
  correct: "#42C98A",
  correctBg: "#EAFBF3",
  correctDark: "#2FA871",

  gold: "#FFC857",
  goldDark: "#E0A82C",
  blueDark: "#4F7EE0",
  blueLightAlt: "#EDF3FF",
  redDark: "#D84E4E",
  redLightAlt: "#FDEAEA",
  locked: "#D9D2CE",
  lockedDark: "#C3B9B4",
};

/**
 * Each theme defines:
 *  primary / deep  -> main brand color and its darker "depth" shade
 *  light / soft    -> pale tints for chips, icon circles, selected states
 *  bg / bgAlt      -> screen background and a slightly deeper surface
 *  border / borderStrong / shadow -> tinted neutrals so cards feel cohesive
 */
export const themes = [
  { id: "peach", name: "Peach", primary: "#FF7A45", deep: "#E85D2A", light: "#FFF0E8", soft: "#FFE7D8", bg: "#FFF9F5", bgAlt: "#FFF3EC", border: "#EEE5DF", borderStrong: "#E1D6CF", shadow: "#E9DED6" },
  { id: "apricot", name: "Apricot", primary: "#F5A25A", deep: "#DB8438", light: "#FEF3E7", soft: "#FCE6CD", bg: "#FFFBF6", bgAlt: "#FEF4E9", border: "#F1E6D8", borderStrong: "#E4D5C1", shadow: "#EADDCB" },
  { id: "coral", name: "Coral", primary: "#F5837A", deep: "#DE6459", light: "#FEEEEC", soft: "#FCDDD9", bg: "#FFF8F7", bgAlt: "#FEF0EE", border: "#F1E0DE", borderStrong: "#E4CDCA", shadow: "#EBD9D6" },
  { id: "rose", name: "Rose", primary: "#F27A9B", deep: "#DB5C80", light: "#FDECF1", soft: "#FAD9E4", bg: "#FFF8FA", bgAlt: "#FDEFF3", border: "#F0DFE5", borderStrong: "#E4CCD5", shadow: "#ECD8DF" },
  { id: "bubblegum", name: "Bubblegum", primary: "#F58CC8", deep: "#DD6DAE", light: "#FEEEF7", soft: "#FCDDEF", bg: "#FFF8FC", bgAlt: "#FEF0F8", border: "#F2E0EB", borderStrong: "#E6CCDB", shadow: "#EDD8E5" },
  { id: "orchid", name: "Orchid", primary: "#D391E8", deep: "#B972D0", light: "#F9EEFD", soft: "#F2DDFA", bg: "#FDF8FF", bgAlt: "#F9F0FC", border: "#EDE0F2", borderStrong: "#DFCCE6", shadow: "#E6D6EC" },
  { id: "lavender", name: "Lavender", primary: "#A98BF0", deep: "#8B6BD9", light: "#F1ECFD", soft: "#E4DAFA", bg: "#FAF8FF", bgAlt: "#F3EFFD", border: "#E6E0F2", borderStrong: "#D5CCE6", shadow: "#DDD5EC" },
  { id: "periwinkle", name: "Periwinkle", primary: "#7D8CF0", deep: "#616FDA", light: "#EEF0FE", soft: "#DDE1FB", bg: "#F8F9FF", bgAlt: "#F0F2FE", border: "#E1E4F3", borderStrong: "#CFD3E8", shadow: "#D8DBEC" },
  { id: "sky", name: "Sky", primary: "#5BB4F0", deep: "#3A94D6", light: "#EAF6FE", soft: "#D6ECFC", bg: "#F5FAFF", bgAlt: "#EDF6FE", border: "#DDE9F2", borderStrong: "#CBDCE9", shadow: "#D3E1EC" },
  { id: "aqua", name: "Aqua", primary: "#3EC6D0", deep: "#22A6B1", light: "#E6F8FA", soft: "#CDF0F3", bg: "#F4FCFD", bgAlt: "#E9F8FA", border: "#D8EBEE", borderStrong: "#C4DDE1", shadow: "#CFE3E6" },
  { id: "teal", name: "Teal", primary: "#4DB6AC", deep: "#349A90", light: "#E6F6F4", soft: "#CFEDE9", bg: "#F4FBFA", bgAlt: "#E9F6F4", border: "#D8EAE7", borderStrong: "#C4DDD9", shadow: "#CFE2DF" },
  { id: "mint", name: "Mint", primary: "#4FC9A0", deep: "#33AE85", light: "#E8F9F3", soft: "#D2F2E6", bg: "#F5FCF9", bgAlt: "#ECF8F3", border: "#DBEBE4", borderStrong: "#C8DDD4", shadow: "#D0E3DB" },
  { id: "sage", name: "Sage", primary: "#8FB38A", deep: "#739A6E", light: "#F0F6EE", soft: "#E0EDDC", bg: "#F8FBF7", bgAlt: "#F0F6EE", border: "#E0E9DD", borderStrong: "#CEDACA", shadow: "#D6E0D3" },
  { id: "lime", name: "Lime", primary: "#9BCB3F", deep: "#7EAE24", light: "#F3F9E4", soft: "#E5F1C6", bg: "#FBFDF5", bgAlt: "#F4F9E8", border: "#E5EDD3", borderStrong: "#D3DEBC", shadow: "#DAE4C6" },
  { id: "lemon", name: "Lemon", primary: "#EDB81A", deep: "#CF9D0C", light: "#FEF7DC", soft: "#FCEFB8", bg: "#FFFDF3", bgAlt: "#FEF9E4", border: "#EFE8CF", borderStrong: "#E2D9B8", shadow: "#E8E0C4" },
  { id: "sand", name: "Sand", primary: "#C9A57A", deep: "#AE8859", light: "#F8F1E8", soft: "#F0E4D3", bg: "#FDFBF7", bgAlt: "#F8F3EB", border: "#EAE2D6", borderStrong: "#DBD0BF", shadow: "#E2D9CB" },
  { id: "cloud", name: "Cloud", primary: "#8DA2B8", deep: "#71879E", light: "#EFF3F7", soft: "#E0E8EF", bg: "#F8FAFC", bgAlt: "#F0F4F8", border: "#E1E7ED", borderStrong: "#CFD8E1", shadow: "#D8E0E8" },
];

export const buildColors = (theme) => ({
  ...baseColors,

  // Brand (screens use both the "orange" and "green" names for the brand)
  orange: theme.primary,
  orangeDeep: theme.deep,
  orangeLight: theme.light,
  orangeSoft: theme.soft,

  green: theme.primary,
  greenDark: theme.deep,
  greenLight: theme.light,
  greenBg: theme.light,

  // Surfaces + neutrals
  bg: theme.bg,
  screenBg: theme.bg,
  bgSecondary: theme.bgAlt,
  bgMuted: theme.bgAlt,
  border: theme.border,
  borderStrong: theme.borderStrong,
  shadow: theme.shadow,
});

const getTheme = (id) =>
  themes.find((item) => item.id === id) ||
  themes.find((item) => item.id === DEFAULT_THEME_ID);

// Static default export, kept so any screen that hasn't been converted to
// useTheme() yet keeps working (it just won't change with the picker).
export const colors = buildColors(getTheme(DEFAULT_THEME_ID));

export const radius = {
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  full: 999,
};

export const shadows = {
  soft: {
    shadowColor: "#E3D4CC",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  card: {
    shadowColor: "#E9D9CF",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
};

export const chunky = (baseColor, depthColor) => ({
  backgroundColor: baseColor,
  borderBottomWidth: 4,
  borderBottomColor: depthColor,
  borderRadius: radius.md,
});

// ---------- Provider ----------

const ThemeContext = createContext({
  themeId: DEFAULT_THEME_ID,
  theme: getTheme(DEFAULT_THEME_ID),
  colors,
  themes,
  setThemeId: () => {},
});

export function ThemeProvider({ children }) {
  const [themeId, setThemeIdState] = useState(DEFAULT_THEME_ID);
  const [ready, setReady] = useState(false);

  // Restore the saved theme once on launch.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && saved && themes.some((item) => item.id === saved)) {
          setThemeIdState(saved);
        }
      } catch (error) {
        // Storage failure is not fatal; fall back to the default theme.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const setThemeId = useCallback(async (id) => {
    if (!themes.some((item) => item.id === id)) return;

    setThemeIdState(id);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, id);
    } catch (error) {
      // Ignore: the theme still applies for this session.
    }
  }, []);

  const value = useMemo(() => {
    const theme = getTheme(themeId);
    return {
      themeId,
      theme,
      colors: buildColors(theme),
      themes,
      setThemeId,
    };
  }, [themeId, setThemeId]);

  // Avoid flashing the default theme before the saved one loads.
  if (!ready) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);