import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadModule, closeServer, installFetch } from "./helpers.mjs";

const { studioApi } = await loadModule("/src/lib/studioApi.js");
test.after(closeServer);

const run = async (fn, reply = { json: {} }) => {
  const calls = installFetch(() => reply);
  await fn();
  assert.equal(calls.length, 1);
  return calls[0];
};
const path = (call) => new URL(call.url).pathname;

test("every call matches a route in docs/API_CONTRACT.md", async () => {
  const table = [
    [() => studioApi.listCourses(), "GET", "/teacher/courses"],
    [() => studioApi.createCourse({ title: "T", description: "D" }), "POST", "/teacher/courses"],
    [() => studioApi.getCourse("c 1"), "GET", "/teacher/courses/c%201"],
    [() => studioApi.updateCourse("c1", { title: "N" }), "PATCH", "/teacher/courses/c1"],
    [() => studioApi.publishCourse("c1"), "POST", "/teacher/courses/c1/publish"],
    [() => studioApi.unpublishCourse("c1"), "POST", "/teacher/courses/c1/unpublish"],
    [() => studioApi.deleteCourse("c1"), "DELETE", "/teacher/courses/c1"],
    [() => studioApi.courseStats("c1"), "GET", "/teacher/courses/c1/stats"],
    [() => studioApi.courseClasses("c1"), "GET", "/teacher/courses/c1/classes"],
    [() => studioApi.giveToClass("c1", "k1"), "PUT", "/teacher/courses/c1/classes/k1"],
    [() => studioApi.takeFromClass("c1", "k1"), "DELETE", "/teacher/courses/c1/classes/k1"],
    [() => studioApi.createModule("c1", { title: "M" }), "POST", "/teacher/courses/c1/modules"],
    [() => studioApi.reorderModules("c1", ["b", "a"]), "PUT", "/teacher/courses/c1/modules/order"],
    [() => studioApi.updateModule("m1", { archived: true }), "PATCH", "/teacher/modules/m1"],
    [() => studioApi.deleteModule("m1"), "DELETE", "/teacher/modules/m1"],
    [() => studioApi.createLesson("m1", { title: "L" }), "POST", "/teacher/modules/m1/lessons"],
    [() => studioApi.reorderLessons("m1", ["b", "a"]), "PUT", "/teacher/modules/m1/lessons/order"],
    [() => studioApi.updateLesson("l1", { title: "x" }), "PATCH", "/teacher/lessons/l1"],
    [() => studioApi.deleteLesson("l1"), "DELETE", "/teacher/lessons/l1"],
    [() => studioApi.listActivities("l1"), "GET", "/teacher/lessons/l1/activities"],
    [() => studioApi.createActivity("l1", { kind: "reading", reading_body: "x" }), "POST", "/teacher/lessons/l1/activities"],
    [() => studioApi.reorderActivities("l1", [2, 1]), "PUT", "/teacher/lessons/l1/activities/order"],
    [() => studioApi.updateActivity(7, { is_required: true }), "PATCH", "/teacher/activities/7"],
    [() => studioApi.deleteActivity(7), "DELETE", "/teacher/activities/7"],
  ];
  const contract = readFileSync(new URL("../../../docs/API_CONTRACT.md", import.meta.url), "utf8");
  for (const [fn, method, expected] of table) {
    const call = await run(fn);
    assert.equal(call.method, method, expected);
    assert.equal(path(call), expected);
    // the contract writes ids as {id}; compare the shape of the route
    const shape = decodeURIComponent(expected).replace(/\/(c ?1|m1|l1|7)(?=\/|$)/g, "/{id}").replace(/\/k1$/, "/{id}");
    const documented = contract
      .split("\n")
      .some((line) => line.includes(method) && line.replace(/\{[a-z_]+\}/g, "{id}").includes(shape.replace(/\/c 1/, "/{id}")));
    assert.ok(documented, `${method} ${expected} is not documented in the API contract`);
  }
});

test("request bodies carry exactly what the contract names", async () => {
  assert.deepEqual((await run(() => studioApi.reorderModules("c1", ["b", "a"]))).body, { ids: ["b", "a"] });
  assert.deepEqual((await run(() => studioApi.reorderActivities("l1", [2, 1]))).body, { ids: [2, 1] });
  assert.deepEqual((await run(() => studioApi.createActivity("l1", { kind: "quiz", is_required: false }))).body, { kind: "quiz", is_required: false });
  assert.equal((await run(() => studioApi.publishCourse("c1"))).body, undefined);
});

test("a server message reaches the caller unchanged", async () => {
  installFetch(() => ({ status: 422, json: { detail: "Add at least one lesson before publishing" } }));
  await assert.rejects(studioApi.publishCourse("c1"), /Add at least one lesson before publishing/);
  installFetch(() => ({ status: 409, json: { detail: "This lesson already has a quiz. Restore it if it was archived." } }));
  await assert.rejects(studioApi.createActivity("l1", { kind: "quiz" }), /already has a quiz/);
});

test("nothing is faked when the server is missing the routes", async () => {
  installFetch(() => ({ status: 404, json: { detail: "Not Found" } }));
  await assert.rejects(studioApi.listCourses(), /Not Found/);
});
