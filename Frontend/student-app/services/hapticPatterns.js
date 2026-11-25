// The haptic "moments" of the app, each with a few candidate feelings to try on a phone.
// Pure data (no React Native imports) so tests can check it; hapticRunner.js plays it.
//
// A feeling is a list of steps: { at: ms from the start, kind, value }.
//   kind "impact": expo-haptics impact (light|medium|heavy|soft|rigid), a short buzz of 43-61 ms
//   kind "notify": expo-haptics notification (success|warning|error), its own multi-pulse pattern
//   kind "system": the phone's own tuned effect (Android HapticFeedbackConstants), e.g. confirm, reject
//
// A new vibration cancels the one still running, so steps must be spaced MIN_GAP apart.
export const MIN_GAP = 70;

const i = (value, at = 0) => ({ at, kind: "impact", value });
const n = (value, at = 0) => ({ at, kind: "notify", value });
const s = (value, at = 0) => ({ at, kind: "system", value });

// Weighty and satisfying: a solid hit, then a short settle. Wrong answers get a gentle double nudge.
export const MOMENTS = [
  {
    id: "press",
    title: "Press a button",
    where: "Every orange and white button, cards, menu rows",
    variants: [
      { id: "a", name: "Dull click", steps: [s("context-click")] },
      { id: "b", name: "Solid tap", steps: [i("medium")] },
      { id: "c", name: "Tap and settle", steps: [i("medium"), i("soft", 80)] },
    ],
  },
  {
    id: "tab",
    where: "Bottom navigation, switching tabs",
    title: "Switch tab",
    variants: [
      { id: "a", name: "Tick", steps: [s("segment-tick")] },
      { id: "b", name: "Medium press", steps: [i("medium")] },
      { id: "c", name: "Weighty click", steps: [s("gesture-end")] },
    ],
  },
  {
    id: "pick",
    title: "Pick an answer",
    where: "Choosing an option before you press Check",
    variants: [
      { id: "a", name: "Light seat", steps: [s("gesture-start")] },
      { id: "b", name: "Firm seat", steps: [i("medium")] },
      { id: "c", name: "Heavy seat", steps: [i("heavy")] },
    ],
  },
  {
    id: "correct",
    title: "Correct answer",
    where: "After Check, when the answer is right",
    variants: [
      { id: "a", name: "System confirm", steps: [s("confirm")] },
      { id: "b", name: "Thud, settle", steps: [i("heavy"), i("soft", 90)] },
      { id: "c", name: "Rising pair", steps: [i("medium"), i("heavy", 110)] },
    ],
  },
  {
    id: "wrong",
    title: "Wrong answer (nudge)",
    where: "After Check, when the answer is wrong. Gentle, not punishing",
    variants: [
      { id: "a", name: "System reject", steps: [s("reject")] },
      { id: "b", name: "Soft knock-knock", steps: [i("soft"), i("soft", 110)] },
      { id: "c", name: "Single low warning", steps: [n("warning")] },
    ],
  },
  {
    id: "stage",
    title: "Stage complete",
    where: "The stage result screen appearing",
    variants: [
      { id: "a", name: "Two-step lift", steps: [i("medium"), i("heavy", 140)] },
      { id: "b", name: "Build to a hit", steps: [i("soft"), i("medium", 110), i("heavy", 240), i("soft", 380)] },
      { id: "c", name: "System confirm + thud", steps: [s("confirm"), i("heavy", 220)] },
    ],
  },
  {
    id: "xp",
    title: "XP counts up",
    where: "The XP number rolling up on the result and profile",
    variants: [
      { id: "a", name: "Three ticks", steps: [s("clock-tick"), s("clock-tick", 100), s("clock-tick", 200)] },
      { id: "b", name: "Rising ticks", steps: [i("soft"), i("soft", 90), i("medium", 180), i("heavy", 280)] },
      { id: "c", name: "One landing", steps: [i("medium")] },
    ],
  },
  {
    id: "streak",
    title: "Streak up",
    where: "When the streak flame grows",
    variants: [
      { id: "a", name: "Heavy hit", steps: [i("heavy")] },
      { id: "b", name: "Heavy, echo", steps: [i("heavy"), i("medium", 130), i("soft", 260)] },
      { id: "c", name: "Long press feel", steps: [s("long-press")] },
    ],
  },
  {
    id: "drag",
    title: "Drag pick up and drop",
    where: "Picking a word up, dropping it in a blank. Plays pick up, then drop 0.7 s later",
    variants: [
      { id: "a", name: "System drag", steps: [s("drag-start"), s("gesture-end", 700)] },
      { id: "b", name: "Lift and thud", steps: [i("soft"), i("heavy", 700)] },
      { id: "c", name: "Lift and settle", steps: [i("medium"), i("medium", 700), i("soft", 790)] },
    ],
  },
  {
    id: "arrive",
    title: "Screen arrives",
    where: "A new screen finishing its slide in. Should be barely there",
    variants: [
      { id: "a", name: "Nothing", steps: [] },
      { id: "b", name: "Soft landing", steps: [i("soft")] },
      { id: "c", name: "Segment tick", steps: [s("segment-tick")] },
    ],
  },
  {
    id: "toggle",
    title: "Switch on, then off",
    where: "Settings toggles. Plays on, then off 0.7 s later",
    variants: [
      { id: "a", name: "System toggle", steps: [s("toggle-on"), s("toggle-off", 700)] },
      { id: "b", name: "Medium, soft", steps: [i("medium"), i("soft", 700)] },
      { id: "c", name: "Click, click", steps: [s("context-click"), s("context-click", 700)] },
    ],
  },
];

// The stage result's three cards (score, stages, best streak) each pop with one beat, rising.
export const STAT_RAMP = ["soft", "medium", "heavy"];

export const lengthOf = (variant) => variant.steps.reduce((end, step) => Math.max(end, step.at), 0);
