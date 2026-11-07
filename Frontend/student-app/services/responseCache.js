// The last answer to each GET, kept with the tag (ETag) the server gave it. The next time
// the app asks, it sends the tag; when nothing changed the server answers "304 Not
// Modified" with no body and the kept answer is used. The server still checks the login
// and access every time, and only says 304 when its answer right now is byte-for-byte the
// same, so this never shows old data: it only skips downloading the same bytes again.
//
// Kept in memory only, and emptied on sign-out.

export function createResponseCache(limit = 60) {
  const entries = new Map(); // path -> { etag, body }

  return {
    get(path) {
      const entry = entries.get(path);
      if (!entry) return null;
      entries.delete(path); // most recently used goes last
      entries.set(path, entry);
      return entry;
    },
    set(path, etag, body) {
      if (!etag) return;
      entries.delete(path);
      entries.set(path, { etag, body });
      while (entries.size > limit) entries.delete(entries.keys().next().value);
    },
    delete(path) {
      entries.delete(path);
    },
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}

// Calls fn(input) only when input is a different object from last time; otherwise returns
// the previous result. A 304 hands back the very same body object, so the screens get the
// very same data object and React can skip redrawing them.
export function sameInputSameOutput(fn) {
  let lastInput;
  let lastOutput;
  let primed = false;
  const memo = (input, ...rest) => {
    if (primed && input === lastInput && rest.length === 0) return lastOutput;
    lastOutput = fn(input, ...rest);
    lastInput = input;
    primed = rest.length === 0;
    return lastOutput;
  };
  memo.reset = () => {
    primed = false;
    lastInput = undefined;
    lastOutput = undefined;
  };
  return memo;
}

// The same request made twice within a few seconds (opening a chapter asks for its
// activities to choose the screen, then the screen asks again) shares one answer.
// Anything that changes the answer clears it first.
export function createShortReuse(maxAgeMs, now = () => Date.now()) {
  const entries = new Map(); // key -> { at, promise }
  return {
    run(key, load) {
      const hit = entries.get(key);
      if (hit && now() - hit.at < maxAgeMs) return hit.promise;
      const promise = load();
      entries.set(key, { at: now(), promise });
      // A failure is never reused, so "Try again" really tries again.
      promise.catch(() => {
        if (entries.get(key)?.promise === promise) entries.delete(key);
      });
      return promise;
    },
    clear() {
      entries.clear();
    },
  };
}

// Should a background refresh run now? Never more often than maxAgeMs; always when asked
// without a limit (after the student's own action, or pull-to-refresh).
export function isStale(lastAt, maxAgeMs, at = Date.now()) {
  if (!maxAgeMs) return true;
  if (!lastAt) return true;
  return at - lastAt >= maxAgeMs;
}
