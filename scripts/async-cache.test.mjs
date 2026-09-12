import assert from "node:assert/strict";
import { createAsyncCache } from "./async-cache.mjs";

const cache = createAsyncCache();
const gate = Promise.withResolvers();
let calls = 0;
const load = () => { calls++; return gate.promise; };
const first = cache("pack", load);
const second = cache("pack", load);
assert.equal(first, second, "pending callers share one promise");
gate.resolve([]);
assert.deepEqual(await first, []);
assert.equal(calls, 1);
assert.equal(cache("pack", () => assert.fail("successful empty results are cached")), first);

const failure = new Error("load failed");
await assert.rejects(cache("retry", () => { throw failure; }), (error) => error === failure);
assert.equal(await cache("retry", () => 42), 42, "synchronous loader failures also permit retry");
const rejected = cache("async retry", () => Promise.reject(failure));
assert.equal(cache("async retry", () => assert.fail("in-flight loader duplicated")), rejected);
await assert.rejects(rejected, (error) => error === failure);
assert.equal(await cache("async retry", () => false), false);
assert.equal(await cache({}, () => "one"), "one");
assert.equal(await cache({}, () => "two"), "two", "distinct pack objects have distinct entries");
console.log("async cache: shared pending work, successful empties, failure retry and identity passed");
