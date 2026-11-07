import test from "node:test";
import assert from "node:assert/strict";
import { newSubmissionId } from "../services/ids.js";

test("submission ids are version 4 UUIDs the server accepts", () => {
  const id = newSubmissionId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("every submission gets its own id", () => {
  const ids = new Set(Array.from({ length: 2000 }, () => newSubmissionId()));
  assert.equal(ids.size, 2000);
});
