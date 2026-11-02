import test from "node:test";
import assert from "node:assert/strict";
import { CAPTION_GAP, MOODS, VOICE_LIMIT, createBrain } from "../services/foxBrain.js";

// A brain with a clock and dice we control.
function make(start = 1_000_000, roll = 0) {
  let t = start;
  const brain = createBrain({ now: () => t, random: () => roll });
  return { brain, tick: (ms) => (t += ms) };
}

test("every reaction uses a known mood and counts up its nonce", () => {
  const { brain } = make();
  const events = ["open", "start", "correct", "wrong", "stageDone", "chapterDone", "courseDone", "idle", "empty", "error"];
  let last = 0;
  for (const event of events) {
    const reaction = brain.react(event, { hour: 9 });
    assert.ok(MOODS.includes(reaction.mood), event);
    assert.ok(reaction.nonce > last, "nonce grows, so the same mood twice still plays");
    last = reaction.nonce;
  }
});

test("the greeting follows the time of day and a long absence", () => {
  const morning = make().brain.react("open", { hour: 8 });
  const evening = make().brain.react("open", { hour: 20 });
  assert.equal(morning.mood, "greeting");
  assert.match(morning.caption, /morning/i);
  assert.ok(evening.caption);
  assert.notEqual(morning.caption, evening.caption);
  assert.match(make().brain.react("open", { hour: 9, daysAway: 5 }).caption, /back|missed/i);
});

test("correct answers build to a cheer; a wrong one is gentle and resets the run", () => {
  const { brain, tick } = make();
  assert.equal(brain.react("correct").mood, "happy");
  assert.equal(brain.react("correct").mood, "happy");
  const third = brain.react("correct");
  assert.equal(third.mood, "cheer");
  assert.equal(third.effect, "sparkle");
  assert.ok(third.caption, "says something at three in a row");
  assert.equal(brain.react("correct").caption, undefined, "but not at four");
  tick(60000);
  const wrong = brain.react("wrong");
  assert.equal(wrong.mood, "gentle");
  assert.equal(wrong.effect, null);
  assert.equal(brain.streak, 0);
  assert.equal(brain.react("correct").mood, "happy", "the run starts again");
});

test("she never mocks a wrong answer", () => {
  for (const roll of [0, 0.3, 0.6, 0.99]) {
    const { brain } = make(1_000_000, roll);
    const reaction = brain.react("wrong");
    assert.equal(reaction.mood, "gentle");
    if (reaction.caption) assert.doesNotMatch(reaction.caption, /wrong|fail|bad|stupid/i);
  }
});

test("a caption of the same kind is not repeated too soon", () => {
  const { brain, tick } = make();
  assert.ok(brain.react("wrong").caption);
  tick(CAPTION_GAP - 1);
  assert.equal(brain.react("wrong").caption, undefined, "still too soon");
  tick(2);
  assert.ok(brain.react("wrong").caption, "enough time has passed");
});

test("variants rotate: the same line is never said twice in a row", () => {
  const { brain, tick } = make(1_000_000, 0); // the dice always pick the first
  const first = brain.react("wrong").caption;
  tick(CAPTION_GAP + 1);
  const second = brain.react("wrong").caption;
  assert.notEqual(first, second);
});

test("spoken lines are capped per session and respect the sound setting", () => {
  const { brain } = make();
  const spoken = [];
  for (let i = 0; i < VOICE_LIMIT + 3; i += 1) spoken.push(brain.react("chapterDone").voice);
  assert.equal(spoken.filter(Boolean).length, VOICE_LIMIT);
  const quiet = make().brain;
  assert.equal(quiet.react("courseDone", { sound: false }).voice, undefined, "no voice when sound is off");
  assert.ok(quiet.react("courseDone").caption, "but the caption is still there");
});

test("she falls asleep when idle, and wakes on a touch, once", () => {
  const { brain } = make();
  const sleepy = brain.react("idle");
  assert.equal(sleepy.mood, "sleepy");
  assert.equal(sleepy.effect, "zzz");
  assert.equal(sleepy.hold, 0, "she stays asleep until something happens");
  assert.equal(brain.react("idle"), null, "already asleep");
  assert.equal(brain.react("wake").mood, "curious");
  assert.equal(brain.react("wake"), null, "nothing to wake from");
});

test("tapping her varies, and a fast double tap counts once", () => {
  const { brain, tick } = make();
  const moods = [];
  for (let i = 0; i < 3; i += 1) {
    moods.push(brain.react("tap").mood);
    assert.equal(brain.react("tap"), null, "too quick");
    tick(600);
  }
  assert.equal(new Set(moods).size, 3, "three different reactions");
});

test("calm returns her to idle and unknown events do nothing", () => {
  const { brain } = make();
  brain.react("chapterDone");
  assert.equal(brain.calm().mood, "idle");
  assert.equal(brain.mood, "idle");
  assert.equal(brain.react("nonsense"), null);
});
