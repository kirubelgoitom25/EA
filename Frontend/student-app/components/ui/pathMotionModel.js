// The numbers behind the path's two small "feel" touches, pure so they are easy to test:
// - the course page's arrival (see arrival.js): one clock in ms, and when each thing plays on it
// - the sparkle (see Sparkle.js): its six particles, and which steps have just been completed
// Both remember things for the session (while the app runs and the same student is logged in).

export const ARRIVAL = {
  lead: 250, // the first chapter starts
  scrollLead: 850, // ...or this late when the page first scrolls down to your chapter
  gap: 500, // between one chapter and the next
  budget: 2900, // everything is over by then
  rise: 280, // a chapter rises and grows...
  settle: 120, // ...then settles
  risePx: 16,
  scaleFrom: 0.9,
  scaleTop: 1.04,
  label: { after: 250, duration: 250 }, // a chapter's few words, after its tile
  words: { after: 350, duration: 300 }, // the current chapter's title and button
  lineStart: 0.5, // the line leaves a chapter this share of a gap after it appears...
  lineEnd: 1.1, // ...and reaches the next one here
  foxAfter: 200, // the fox, after the last chapter starts
  fox: 500,
  foxPx: 90,
  header: { duration: 300, lift: 6 },
  bar: { delay: 300, duration: 800 },
  routineWait: 3000, // the current chapter's own routine starts once all this is over
};

const TILE_HALF = 42;
const LINE_CAP = 6; // the line's first dot has a round end that reaches a little above its point
const easeOut = (p) => 1 - (1 - p) * (1 - p);
const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));
const round = (n) => Math.round(n * 100) / 100;

// When everything plays. stops: the y of each chapter's middle, then the den's; top / bottom: the part
// of the path in view once the page has landed; total: the path's height. Only stops in view play, in
// order; the gap tightens when many are in view, so the whole thing stays inside the budget.
// at[i] is when stop i starts (no entry: it is simply there); line is how far down the dotted line
// has been drawn, as interpolate frames over the clock.
export function arrivalPlan({ stops, top, bottom, total, lead = ARRIVAL.lead }) {
  const shown = stops.map((y, i) => ({ y, i })).filter(({ y }) => y + TILE_HALF >= top && y - TILE_HALF <= bottom);
  const room = ARRIVAL.budget - lead - ARRIVAL.foxAfter - ARRIVAL.fox;
  const gap = shown.length > 1 ? Math.min(ARRIVAL.gap, room / (shown.length - 1)) : ARRIVAL.gap;
  const at = {};
  shown.forEach(({ i }, order) => {
    at[i] = Math.round(lead + order * gap);
  });
  const lastAt = shown.length ? at[shown[shown.length - 1].i] : lead;
  const fox = lastAt + ARRIVAL.foxAfter;
  const end = fox + ARRIVAL.fox;

  const inputRange = [0];
  const outputRange = [shown.length ? shown[0].y - LINE_CAP : total];
  shown.forEach(({ i, y }, order) => {
    const next = shown[order + 1];
    inputRange.push(at[i] + gap * ARRIVAL.lineStart, at[i] + gap * ARRIVAL.lineEnd);
    outputRange.push(y, next ? next.y : total);
  });
  inputRange.push(Math.max(end, inputRange[inputRange.length - 1] + 1));
  outputRange.push(total);
  return { at, fox, end, line: { inputRange, outputRange } };
}

// How long a step's burst must wait for that step to have arrived on the page (0 once it has, or when
// it was never part of the arrival). plan: the arrival, with startedAt, or nothing; now: Date.now().
export function burstDelay(plan, index, now) {
  const at = plan?.at[index];
  if (at === undefined) return 0;
  return Math.max(0, plan.startedAt + at + ARRIVAL.rise + ARRIVAL.settle - now);
}

// A chapter's rise from `at`: rises, fades in and grows past full size, then settles. Sampled, because
// interpolate itself is linear between points.
export function riseFrames(at) {
  const inputRange = [];
  const opacity = [];
  const y = [];
  const scale = [];
  const add = (ms, o, dy, s) => {
    inputRange.push(round(ms));
    opacity.push(round(o));
    y.push(round(dy));
    scale.push(round(s));
  };
  const { rise, settle, risePx, scaleFrom, scaleTop } = ARRIVAL;
  for (let s = 0; s <= 6; s += 1) {
    const e = easeOut(s / 6);
    add(at + (rise * s) / 6, e, risePx * (1 - e), scaleFrom + (scaleTop - scaleFrom) * e);
  }
  for (let s = 1; s <= 4; s += 1) {
    add(at + rise + (settle * s) / 4, 1, 0, scaleTop + (1 - scaleTop) * easeInOut(s / 4));
  }
  return { inputRange, opacity, y, scale };
}

// The fox's slide in from the right, from `at`.
export function foxFrames(at) {
  const inputRange = [];
  const x = [];
  for (let s = 0; s <= 8; s += 1) {
    inputRange.push(round(at + (ARRIVAL.fox * s) / 8));
    x.push(round(ARRIVAL.foxPx * (1 - easeOut(s / 8))));
  }
  return { inputRange, x };
}

// The sparkle, from the check appearing: fades in over `fadeIn`, flies out for `fly`, gone by `life`.
export const SPARK = { fadeIn: 80, fly: 500, life: 800, scaleFrom: 0.3, scaleEnd: 0.5, star: 14, dot: 8 };

// Six directions all round the button. colour: "gold" or "done".
export const SPARKS = [
  { shape: "star", colour: "gold", dx: -48, dy: -28 },
  { shape: "dot", colour: "done", dx: 46, dy: -35 },
  { shape: "star", colour: "gold", dx: 54, dy: 20 },
  { shape: "dot", colour: "gold", dx: -7, dy: -57 },
  { shape: "dot", colour: "done", dx: -52, dy: 24 },
  { shape: "star", colour: "done", dx: 9, dy: 55 },
];

// --- what the session remembers ---

const opened = new Set();
const lastSeen = new Map(); // a step's id -> done, as last shown on any path

// True the first time this is asked for a key in a session.
export function firstOpen(key) {
  if (opened.has(key)) return false;
  opened.add(key);
  return true;
}

// The indexes of the steps that have just been completed: shown as not done before, on any path, and
// done now. A step seen done is remembered as done for good, so a burst plays once per completion
// and a step that is merely new to this session never bursts.
export function newlyDone(items) {
  const fresh = [];
  items.forEach((item, i) => {
    if (!item.id) return;
    const done = item.status === "done";
    if (done && lastSeen.get(item.id) === false) fresh.push(i);
    if (!lastSeen.get(item.id)) lastSeen.set(item.id, done);
  });
  return fresh;
}

// Logged out: the next student starts a new session.
export function forgetPathMotion() {
  opened.clear();
  lastSeen.clear();
}
