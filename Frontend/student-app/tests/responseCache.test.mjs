import test from "node:test";
import assert from "node:assert/strict";
import {
  createResponseCache,
  createShortReuse,
  isStale,
  sameInputSameOutput,
} from "../services/responseCache.js";

test("a kept answer is returned with its tag, and only with a tag", () => {
  const cache = createResponseCache();
  const body = [{ id: "c1" }];
  cache.set("/courses", 'W/"abc"', body);
  assert.deepEqual(cache.get("/courses"), { etag: 'W/"abc"', body });
  assert.equal(cache.get("/courses").body, body); // the very same object
  cache.set("/me/stats", null, { xp: 1 }); // a server without ETags: nothing kept
  assert.equal(cache.get("/me/stats"), null);
});

test("the oldest answer goes first when full, and clear() empties it", () => {
  const cache = createResponseCache(2);
  cache.set("/a", "1", 1);
  cache.set("/b", "2", 2);
  cache.get("/a"); // /a was used last, so /b is the oldest now
  cache.set("/c", "3", 3);
  assert.equal(cache.get("/b"), null);
  assert.ok(cache.get("/a"));
  assert.ok(cache.get("/c"));
  cache.clear();
  assert.equal(cache.size, 0);
});

test("the same input gives the very same output object, so screens need not redraw", () => {
  let calls = 0;
  const map = sameInputSameOutput((raw) => {
    calls += 1;
    return raw.map((x) => ({ ...x }));
  });
  const raw = [{ id: 1 }];
  const first = map(raw);
  assert.equal(map(raw), first);
  assert.equal(calls, 1);
  assert.notEqual(map([{ id: 1 }]), first); // a new answer is mapped again
  map.reset();
  assert.notEqual(map(raw), first);
});

test("a request repeated within the window shares one answer; after it, asks again", async () => {
  let clock = 0;
  let loads = 0;
  const reuse = createShortReuse(5000, () => clock);
  const load = () => {
    loads += 1;
    return Promise.resolve({ n: loads });
  };
  const a = await reuse.run("lesson-1", load);
  const b = await reuse.run("lesson-1", load);
  assert.equal(a, b);
  assert.equal(loads, 1);
  await reuse.run("lesson-2", load); // another lesson is its own entry
  assert.equal(loads, 2);
  clock = 5000;
  await reuse.run("lesson-1", load);
  assert.equal(loads, 3);
});

test("clear() makes the next request fresh (after Mark complete or a submit)", async () => {
  let loads = 0;
  const reuse = createShortReuse(5000, () => 0);
  const load = () => Promise.resolve(++loads);
  await reuse.run("l", load);
  reuse.clear();
  assert.equal(await reuse.run("l", load), 2);
});

test("a failed request is never reused, so Try again really tries again", async () => {
  let loads = 0;
  const reuse = createShortReuse(5000, () => 0);
  await assert.rejects(reuse.run("l", () => Promise.reject(new Error("offline"))));
  await Promise.resolve(); // let the cleanup run
  const value = await reuse.run("l", () => Promise.resolve(++loads));
  assert.equal(value, 1);
});

test("refresh timing: always without a limit, otherwise only when old enough", () => {
  assert.equal(isStale(1000, undefined, 1001), true); // own action / pull-to-refresh
  assert.equal(isStale(0, 30000, 5), true); // never loaded
  assert.equal(isStale(1000, 30000, 30999), false);
  assert.equal(isStale(1000, 30000, 31000), true);
});
