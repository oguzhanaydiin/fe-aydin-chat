import assert from "node:assert/strict"
import test from "node:test"

import { canMessagePeer, normalizeIdentity } from "./identity.ts"

test("normalizeIdentity trims and lowercases", () => {
  assert.equal(normalizeIdentity("  Alice "), "alice")
})

test("canMessagePeer allows accepted friends only for DMs", () => {
  const friends = ["alice", "Bob"]

  assert.equal(canMessagePeer("alice", friends), true)
  assert.equal(canMessagePeer("  BOB ", friends), true)
  assert.equal(canMessagePeer("charlie", friends), false)
  assert.equal(canMessagePeer("", friends), false)
  assert.equal(canMessagePeer(null, friends), false)
})

test("canMessagePeer allows group conversations by prefix", () => {
  assert.equal(canMessagePeer("group:abc", []), true)
  assert.equal(canMessagePeer("group: ", []), false)
  assert.equal(canMessagePeer("group:", []), false)
})
