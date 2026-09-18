import { test } from "node:test";
import assert from "node:assert/strict";
import { computeThreeWayDiff } from "./sync.ts";

const pair = (key: string, value: string) => ({ key, value });

test("new local key is an upsert", () => {
  const d = computeThreeWayDiff([pair("A", "1"), pair("B", "2")], ["A"], [pair("A", "1")]);
  assert.deepEqual(d.toUpsert, [pair("B", "2")]);
  assert.deepEqual(d.toDelete, []);
});

test("tracked key with a changed value is an upsert", () => {
  const d = computeThreeWayDiff([pair("A", "changed")], ["A"], [pair("A", "1")]);
  assert.deepEqual(d.toUpsert, [pair("A", "changed")]);
});

test("tracked key equal to remote is left alone", () => {
  const d = computeThreeWayDiff([pair("A", "1")], ["A"], [pair("A", "1")]);
  assert.deepEqual(d.toUpsert, []);
  assert.deepEqual(d.toDelete, []);
});

test("key removed locally since last sync is a delete", () => {
  const d = computeThreeWayDiff([pair("A", "1")], ["A", "B"], [pair("A", "1"), pair("B", "2")]);
  assert.deepEqual(d.toDelete, ["B"]);
});

test("remote-only key the client has never seen is never deleted", () => {
  // The guard against a stale/partial local file mass-deleting cloud state.
  const d = computeThreeWayDiff([pair("A", "1")], ["A"], [pair("A", "1"), pair("UNSEEN", "x")]);
  assert.deepEqual(d.toDelete, []);
  assert.deepEqual(d.toUpsert, []);
});

test("a local key absent from base AND remote still deletes nothing", () => {
  const d = computeThreeWayDiff([], ["A"], []);
  assert.deepEqual(d.toDelete, [], "base key already gone remotely is not re-deleted");
});
