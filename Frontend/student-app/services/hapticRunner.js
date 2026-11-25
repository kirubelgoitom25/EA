import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

// Plays a feeling from hapticPatterns.js. The Feel Lab calls this directly, so it ignores the
// app's haptics switch (a lab you can't feel would be no use). Best effort: never throws.

const SYSTEM = {
  confirm: Haptics.AndroidHaptics.Confirm,
  reject: Haptics.AndroidHaptics.Reject,
  "gesture-start": Haptics.AndroidHaptics.Gesture_Start,
  "gesture-end": Haptics.AndroidHaptics.Gesture_End,
  "toggle-on": Haptics.AndroidHaptics.Toggle_On,
  "toggle-off": Haptics.AndroidHaptics.Toggle_Off,
  "clock-tick": Haptics.AndroidHaptics.Clock_Tick,
  "context-click": Haptics.AndroidHaptics.Context_Click,
  "drag-start": Haptics.AndroidHaptics.Drag_Start,
  "long-press": Haptics.AndroidHaptics.Long_Press,
  "segment-tick": Haptics.AndroidHaptics.Segment_Tick,
};

const IMPACT = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
  soft: Haptics.ImpactFeedbackStyle.Soft,
  rigid: Haptics.ImpactFeedbackStyle.Rigid,
};

const NOTIFY = {
  success: Haptics.NotificationFeedbackType.Success,
  warning: Haptics.NotificationFeedbackType.Warning,
  error: Haptics.NotificationFeedbackType.Error,
};

// iOS has no system effects, so each one maps to the closest impact or notification.
const IOS_EQUIVALENT = {
  confirm: () => Haptics.notificationAsync(NOTIFY.success),
  reject: () => Haptics.notificationAsync(NOTIFY.error),
  "long-press": () => Haptics.impactAsync(IMPACT.heavy),
  "drag-start": () => Haptics.impactAsync(IMPACT.medium),
  "gesture-end": () => Haptics.impactAsync(IMPACT.rigid),
  "context-click": () => Haptics.impactAsync(IMPACT.rigid),
};

const fire = ({ kind, value }) => {
  if (kind === "impact") return Haptics.impactAsync(IMPACT[value]);
  if (kind === "notify") return Haptics.notificationAsync(NOTIFY[value]);
  if (Platform.OS === "android") return Haptics.performAndroidHapticsAsync(SYSTEM[value]);
  return (IOS_EQUIVALENT[value] ?? (() => Haptics.selectionAsync()))();
};

let timers = [];

export function stopFeeling() {
  timers.forEach(clearTimeout);
  timers = [];
}

export function playFeeling(variant) {
  stopFeeling();
  if (Platform.OS === "web") return;
  variant.steps.forEach((step) => {
    const run = () => {
      try {
        Promise.resolve(fire(step)).catch(() => {});
      } catch (e) {}
    };
    if (step.at <= 0) run();
    else timers.push(setTimeout(run, step.at));
  });
}
