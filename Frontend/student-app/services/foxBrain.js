// The fox's brain: given what just happened in the app, what does she do? Pure (no React, no
// storage), so it is easy to test. Screens only report events; this decides her mood, a small effect,
// maybe a few words (and, later, a spoken line), and how long the mood lasts. The rules that keep her
// from being annoying live here: cooldowns, rotating variants, and a cap on spoken lines.
//
// Events: open, start, correct, wrong, stageDone, chapterDone, courseDone, idle, wake, tap, empty, error.
// A reaction: { mood, effect, caption, voice, hold, nonce }
//   mood: one of MOODS (also the vocabulary of the animation later)
//   effect: "sparkle" | "heart" | "zzz" | "question" | null
//   caption: a few words to show beside her, or undefined
//   voice: the id of a spoken line (played only if there is one and sound is on), or undefined
//   hold: ms until she goes back to idle (0 = she stays until something else happens)
//   nonce: a counter, so the same mood twice in a row still plays again

export const MOODS = ["idle", "curious", "happy", "cheer", "proud", "gentle", "sleepy", "walking", "greeting"];

export const VOICE_LIMIT = 4; // spoken lines per session
export const CAPTION_GAP = 20000; // the same kind of caption at most this often

const LINES = {
  morning: ["Good morning!", "Morning! Ready to learn?"],
  afternoon: ["Hi again!", "Good to see you!"],
  evening: ["Evening! Shall we?", "Hi! Let's do a little."],
  back: ["Welcome back!", "I missed you!"],
  streak3: ["Three in a row!", "You're on a roll!"],
  streak5: ["Five in a row! Wow!", "You're on fire!"],
  wrong: ["Not quite. You've got this.", "Close! Try the next one.", "That's okay. Keep going."],
  stage: ["Nice work!", "Stage done!"],
  chapter: ["Chapter complete!", "You did it!"],
  course: ["You reached the den!", "Course complete. I'm so proud!"],
  empty: ["Nothing here yet.", "Hmm, it's quiet."],
  error: ["Oops. Let's try again.", "Something went wrong."],
};

const TAP_MOODS = ["happy", "curious", "cheer"];

export function createBrain({ now = Date.now, random = Math.random } = {}) {
  const lastCaption = {};
  const variant = {};
  let streak = 0;
  let voiceUsed = 0;
  let taps = 0;
  let lastTap = -Infinity;
  let nonce = 0;
  let mood = "idle";

  // The next variant of a line, never the same one twice in a row.
  const pick = (key) => {
    const options = LINES[key];
    let i = Math.floor(random() * options.length);
    if (options.length > 1 && i === variant[key]) i = (i + 1) % options.length;
    variant[key] = i;
    return options[i];
  };

  // A caption, unless one of this kind was shown recently.
  const say = (key, gap = CAPTION_GAP, chance = 1) => {
    const t = now();
    if (t - (lastCaption[key] ?? -Infinity) < gap || random() > chance) return undefined;
    lastCaption[key] = t;
    return pick(key);
  };

  // A spoken line, while the session's allowance lasts.
  const voice = (id, info) => {
    if (info.sound === false || voiceUsed >= VOICE_LIMIT) return undefined;
    voiceUsed += 1;
    return id;
  };

  const done = (reaction) => {
    mood = reaction.mood;
    nonce += 1;
    return { effect: null, hold: 2000, ...reaction, nonce };
  };

  function react(event, info = {}) {
    switch (event) {
      case "open": {
        const hour = info.hour ?? 12;
        const away = (info.daysAway ?? 0) >= 3;
        const key = away ? "back" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
        return done({ mood: "greeting", caption: say(key, 60000), voice: voice(away ? "back" : "hello", info), hold: 2800 });
      }
      case "start":
        return done({ mood: "happy", hold: 1200 });
      case "correct":
        streak += 1;
        if (streak >= 5) return done({ mood: "cheer", effect: "sparkle", caption: streak === 5 ? say("streak5", 0) : undefined, hold: 2200 });
        if (streak >= 3) return done({ mood: "cheer", effect: "sparkle", caption: streak === 3 ? say("streak3", 0) : undefined, hold: 2000 });
        return done({ mood: "happy", hold: 1400 });
      case "wrong":
        streak = 0;
        return done({ mood: "gentle", caption: say("wrong", CAPTION_GAP, 0.5), hold: 2200 });
      case "stageDone":
        return done({ mood: "cheer", effect: "sparkle", caption: say("stage", 0), hold: 2600 });
      case "chapterDone":
        return done({ mood: "proud", effect: "sparkle", caption: say("chapter", 0), voice: voice("chapter", info), hold: 3200 });
      case "courseDone":
        return done({ mood: "proud", effect: "sparkle", caption: say("course", 0), voice: voice("course", info), hold: 3600 });
      case "idle":
        if (mood === "sleepy") return null;
        return done({ mood: "sleepy", effect: "zzz", hold: 0 });
      case "wake":
        if (mood !== "sleepy") return null;
        return done({ mood: "curious", hold: 1200 });
      case "tap": {
        const t = now();
        if (t - lastTap < 500) return null;
        lastTap = t;
        const next = TAP_MOODS[taps % TAP_MOODS.length];
        taps += 1;
        return done({ mood: next, effect: next === "happy" ? "heart" : next === "curious" ? "question" : "sparkle", hold: 1400 });
      }
      case "empty":
        return done({ mood: "curious", caption: say("empty", CAPTION_GAP), hold: 2400 });
      case "error":
        return done({ mood: "gentle", caption: say("error", CAPTION_GAP), hold: 2400 });
      default:
        return null;
    }
  }

  // Back to calm, without it counting as an event.
  const calm = () => {
    mood = "idle";
    nonce += 1;
    return { mood: "idle", effect: null, hold: 0, nonce };
  };

  return { react, calm, get streak() { return streak; }, get mood() { return mood; } };
}
