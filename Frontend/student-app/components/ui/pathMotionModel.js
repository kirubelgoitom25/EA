// The numbers behind the path's two small "feel" touches, pure so they are easy to test:
// - the course page's arrival (see arrival.js): one clock in ms, and when each thing plays on it
// - the sparkle (see Sparkle.js): its six particles, and which steps have just been completed
// - the advance (see Route.js / StepMorph.js): a path shown again after progress plays it once
// All remember things for the session (while the app runs and the same student is logged in).

import { travelled } from "./pathModel.js";

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
  tabs: { from: 300, to: 800, px: 80 }, // the tab bar slides up into place, with the header
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

// The advance, from the "next lesson" and "back to path" references, at 80% of their pace so the whole
// thing takes about 1.5 s. Every window is [start, end] in ms from the moment the path shows the new
// state; each piece plays after the one before it:
// the finished step's play turns into a check and its tile into the done colour, its ring shrinks away
// and the fox ducks behind it, its words fade and its plain label appears; the line fills on to the
// next step, which unlocks with a small pop and gets its ring; the fox peeks up behind it and its
// words come in.
export const ADVANCE = {
  iconOut: [0, 160],
  checkIn: [160, 400],
  checkPeak: 320, // the check overshoots to 115% here, then settles
  face: [80, 320],
  ringOut: [240, 480],
  wordsOut: [240, 400],
  labelIn: [480, 720],
  line: [480, 960],
  bar: [400, 880],
  unlock: [880, 1056],
  pop: [1056, 1200],
  popPeak: 1080, // 108%
  ringIn: [960, 1240],
  foxDuck: [240, 480],
  foxPeek: [1120, 1520],
  wordsIn: [1240, 1480],
  end: 1520,
  lead: 200, // the path holds its old state this long after its first frame is drawn, then the advance plays
  duckPx: 60,
  ringOutScale: 0.78,
  ringInScale: 0.8,
};

// from -> to over the window [a, b] with a calm ease-in-out, as interpolate frames (interpolate itself is
// linear between points, so the curve is sampled).
export function easedFrames([a, b], from, to, steps = 8) {
  const inputRange = [];
  const outputRange = [];
  for (let s = 0; s <= steps; s += 1) {
    inputRange.push(round(a + ((b - a) * s) / steps));
    outputRange.push(round(from + (to - from) * easeInOut(s / steps)));
  }
  return { inputRange, outputRange };
}

// The two moves between the course page and a chapter page, in ms, each window [start, end]; together
// about 1.5 s (from the chapter-to-lessons and back-to-path references, a little quicker).
// - exit (course page, after Continue): the other chapters fade away, done ones up and the rest down,
//   the current one's words, the line and the fox go, the tab bar slides down, the title fades, and the
//   chapter's tile travels to where its lesson will be on the chapter page (its icon turning into the
//   lesson's on the way). Then the chapter page shows.
// - enter (chapter page, from that tile): its panel and title come in, the other lessons rise in, the
//   line draws on, the den pops up and the fox peeks up behind the current lesson.
// - back (chapter page -> course page): the chapter page fades out a little smaller, the course page
//   fades in from a little larger, and its advance waits for that (lead) before it plays.
export const SCREEN = {
  exit: { others: [0, 300], shiftPx: 24, words: [0, 170], line: [0, 170], fox: [0, 300], foxPx: 18, tabs: [0, 340], tabsPx: 90, title: [0, 220], tile: [80, 600], icon: [340, 520], end: 600, settle: [600, 900] },
  enter: { panel: [0, 250], title: [0, 260], titlePx: 8, bar: { delay: 0, duration: 400 }, others: [120, 380], othersPx: 6, line: [200, 600], den: [520, 800], fox: [480, 880], end: 880 },
  back: { out: 300, outOpacity: 0.6, outScale: 0.97, in: 400, inScale: 1.03, lead: 450 },
};

// --- what the session remembers ---

const opened = new Set();
const shownStatus = new Map(); // a step's id (or "den:<path>") -> its status as last shown on a path
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

// What changed on a path since it (or another path with the same steps) was last shown, worth
// playing as an advance: steps just done, steps just unlocked (to do -> current), the step that was
// current, the den just reached, and how far the travelled line reached before and now. null when
// nothing moved forward (a first showing, or progress reset by practising again). It also remembers
// what is shown now, so each advance plays once. items: the path's steps ({ id, status });
// denKey / denReached: the path's den, if it has one.
export function advanceOf(items, denKey = null, denReached = false) {
  const done = [];
  const unlock = [];
  let leaving = -1;
  const before = items.map((item) => {
    if (!item.id) return item;
    const prev = shownStatus.get(item.id);
    shownStatus.set(item.id, item.status);
    if (prev === undefined || prev === item.status) return item;
    if (item.status === "done") {
      done.push(items.indexOf(item));
      if (prev === "next") leaving = items.indexOf(item);
    } else if (item.status === "next" && prev === "todo") {
      unlock.push(items.indexOf(item));
    }
    return { ...item, status: prev };
  });
  let denLit = false;
  if (denKey) {
    const id = `den:${denKey}`;
    const prev = shownStatus.get(id);
    shownStatus.set(id, !!denReached);
    denLit = prev === false && !!denReached;
  }
  if (!done.length && !denLit) return null;
  const lastFrom = Math.max(0, travelled(before, denKey ? { reached: !denLit && !!denReached } : null));
  const lastTo = travelled(items, denKey ? { reached: !!denReached } : null);
  return { done, unlock, leaving, denLit, lastFrom, lastTo, before: before.map((item) => item.status) };
}

// Logged out: the next student starts a new session.
export function forgetPathMotion() {
  opened.clear();
  lastSeen.clear();
  shownStatus.clear();
}
