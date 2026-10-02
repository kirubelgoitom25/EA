import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { createAudioPlayer, setAudioModeAsync } from "expo-audio";

// Central sound + haptic feedback. Screens only call `feedback.xxx()`.
// Everything here is best-effort: any failure is swallowed so it can never
// affect quiz/practice behaviour.

const STORAGE_KEY = "ea.feedback.settings.v1";
const MIN_GAP_MS = 60; // ignore the same sound re-triggered within this window
const LIGHT_HAPTIC_GAP_MS = 40;
const BUTTON_HAPTIC_STYLE = Haptics.ImpactFeedbackStyle.Soft;

const SOURCES = {
  correct: require("../assets/sounds/correct.wav"),
  wrong: require("../assets/sounds/wrong.wav"),
  button: require("../assets/sounds/button.wav"),
  xp: require("../assets/sounds/xp.wav"),
  complete: require("../assets/sounds/complete.wav"),
  streak: require("../assets/sounds/streak.wav"),
};

let settings = { sound: true, haptics: true }; // defaults: both ON
const listeners = new Set();
const players = {}; // one reusable player per sound
const lastPlayed = {};
let audioModePromise;
let lastLightHapticAt = null;

const warn = (...args) => {
  console.warn("[feedback]", ...args);
};

const emit = () => {
  const snapshot = { ...settings };
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (e) {}
  });
};

// Load persisted settings once, in the background (never awaited by callers).
(async () => {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      settings = {
        sound: parsed?.sound !== false,
        haptics: parsed?.haptics !== false,
      };
      emit();
    }
  } catch (e) {
    warn("could not load settings", e?.message);
  }
})();

const persist = () =>
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings)).catch(() => {});

const getPlayer = (name) => {
  if (players[name]) return players[name];

  try {
    const player = createAudioPlayer(SOURCES[name], { updateInterval: 100 });
    player.volume = 1.0;

    let reportedError;
    player.addListener("playbackStatusUpdate", (status) => {
      if (status.error && status.error !== reportedError) {
        reportedError = status.error;
        warn(`playback error for "${name}"`, status.error);
      } else if (!status.error) {
        reportedError = undefined;
      }
    });

    let subscription;
    let timeout;
    const ready = new Promise((resolve, reject) => {
      const cleanup = () => {
        subscription?.remove();
        clearTimeout(timeout);
      };
      const onStatus = (status) => {
        if (status.error) {
          cleanup();
          reject(new Error(status.error));
        } else if (status.isLoaded) {
          cleanup();
          resolve();
        }
      };

      subscription = player.addListener("playbackStatusUpdate", onStatus);
      timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out while loading sound"));
      }, 5000);

      if (player.isLoaded) {
        cleanup();
        resolve();
      }
    });

    ready.catch((error) => {
      warn(`could not load "${name}"`, error?.message ?? error);
    });
    players[name] = { player, ready };
    return players[name];
  } catch (e) {
    warn(`could not create player "${name}"`, e?.message);
    return null;
  }
};

const playSound = async (name) => {
  if (!settings.sound) return;
  const now = Date.now();
  if (now - (lastPlayed[name] || 0) < MIN_GAP_MS) return;
  lastPlayed[name] = now;

  try {
    audioModePromise ??= setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
    }).catch((error) => {
      warn("could not configure audio mode", error?.message ?? error);
    });
    await audioModePromise;

    const entry = getPlayer(name);
    if (!entry) return;
    await entry.ready;
    entry.player.volume = 1.0;
    await entry.player.seekTo(0);
    entry.player.play();
  } catch (error) {
    warn(`could not play "${name}"`, error?.message ?? error);
  }
};

const runHaptic = (run) => {
  if (!settings.haptics) return;
  try {
    Promise.resolve(run()).catch(() => {});
  } catch (e) {
    warn("haptic failed", e?.message);
  }
};

const impact = (style) => runHaptic(() => Haptics.impactAsync(style));
const notify = (type) => runHaptic(() => Haptics.notificationAsync(type));

export const haptic = {
  light() {
    if (Platform.OS === "web" || !settings.haptics) return;

    const now = Date.now();
    if (
      lastLightHapticAt !== null &&
      now - lastLightHapticAt < LIGHT_HAPTIC_GAP_MS
    ) return;
    lastLightHapticAt = now;

    impact(BUTTON_HAPTIC_STYLE);
  },
};

export const feedback = {
  correct() {
    playSound("correct");
    impact(Haptics.ImpactFeedbackStyle.Light);
  },

  wrong() {
    playSound("wrong");
    notify(Haptics.NotificationFeedbackType.Error);
  },

  button() {
    playSound("button");
    impact(BUTTON_HAPTIC_STYLE);
  },

  xp() {
    playSound("xp");
    impact(Haptics.ImpactFeedbackStyle.Light);
  },

  // Pass { xp } to chain the XP reward right after the completion sound,
  // so the two never play on top of each other.
  complete({ xp = 0 } = {}) {
    playSound("complete");
    notify(Haptics.NotificationFeedbackType.Success);
    if (xp > 0) {
      setTimeout(() => feedback.xp(), 750);
    }
  },

  streak() {
    playSound("streak");
    impact(Haptics.ImpactFeedbackStyle.Heavy);
  },

  // Optional: call once at app start to avoid any first-play delay.
  preload() {
    Object.keys(SOURCES).forEach(getPlayer);
  },

  getSettings: () => ({ ...settings }),

  setSoundEnabled(value) {
    settings = { ...settings, sound: !!value };
    persist();
    emit();
  },

  setHapticsEnabled(value) {
    settings = { ...settings, haptics: !!value };
    persist();
    emit();
  },
};

// For the settings UI only.
export function useFeedbackSettings() {
  const [state, setState] = useState(feedback.getSettings());

  useEffect(() => {
    listeners.add(setState);
    setState(feedback.getSettings());
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return state;
}
