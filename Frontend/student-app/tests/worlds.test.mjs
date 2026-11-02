import test from "node:test";
import assert from "node:assert/strict";
import { PATTERNS, WORLDS, worldFor } from "../components/ui/worlds.js";

test("a course always gets the same world", () => {
  assert.deepEqual(worldFor("demo-travel-english-9d5535"), worldFor("demo-travel-english-9d5535"));
});

test("a world has a colour set and one of the known patterns", () => {
  const world = worldFor("a2");
  for (const key of ["bg", "tint", "shade", "on"]) assert.match(world[key], /^#[0-9A-F]{6}$/i);
  assert.ok(PATTERNS.includes(world.pattern));
  assert.ok(WORLDS.some((entry) => entry.key === world.key));
});

test("different courses spread across the worlds and the patterns", () => {
  const ids = Array.from({ length: 60 }, (_, i) => `course-${i}-${i * 7919}`);
  const keys = new Set(ids.map((id) => worldFor(id).key));
  const patterns = new Set(ids.map((id) => worldFor(id).pattern));
  assert.equal(keys.size, WORLDS.length);
  assert.equal(patterns.size, PATTERNS.length);
});

test("missing ids still give a world", () => {
  assert.ok(worldFor(undefined).bg);
  assert.ok(worldFor(null).pattern);
});
