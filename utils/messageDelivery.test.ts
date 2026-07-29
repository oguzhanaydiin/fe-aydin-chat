import assert from "node:assert/strict"
import test from "node:test"

import type { ChatMessage } from "./chatTypes.ts"
import {
  canSendWsNow,
  clearPendingRetryByClientMessageId,
  clientMessageIdFromPendingEvent,
  mergeMessagesByPeer,
  pruneHistoryForStorage,
} from "./messageDelivery.ts"

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, "id">): ChatMessage {
  return {
    from_user_id: "alice",
    to_user_id: "bob",
    text: "hi",
    created_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  }
}

test("pruneHistoryForStorage keeps newest N per peer including images", () => {
  const messages = Array.from({ length: 5 }, (_, i) => msg({
    id: `m${i}`,
    created_at: `2026-01-0${i + 1}T00:00:00.000Z`,
    image_data_url: i === 4 ? "data:image/png;base64,abc" : undefined,
  }))

  const pruned = pruneHistoryForStorage({ bob: messages }, 3)
  assert.equal(pruned.bob.length, 3)
  assert.deepEqual(pruned.bob.map((m) => m.id), ["m2", "m3", "m4"])
  assert.equal(pruned.bob[2].image_data_url, "data:image/png;base64,abc")
})

test("mergeMessagesByPeer lets live inbox win over hydrated history", () => {
  const hydrated = {
    bob: [msg({ id: "1", text: "old" }), msg({ id: "2", text: "hydrated-only" })],
  }
  const live = {
    bob: [msg({ id: "1", text: "from-inbox" }), msg({ id: "3", text: "live-only" })],
  }

  const merged = mergeMessagesByPeer(hydrated, live)
  assert.equal(merged.bob.length, 3)
  assert.equal(merged.bob.find((m) => m.id === "1")?.text, "from-inbox")
  assert.ok(merged.bob.some((m) => m.id === "2"))
  assert.ok(merged.bob.some((m) => m.id === "3"))
})

test("mergeMessagesByPeer preserves live peers missing from hydrate", () => {
  const merged = mergeMessagesByPeer(
    {},
    { bob: [msg({ id: "inbox-1", text: "fresh" })] },
  )
  assert.equal(merged.bob.length, 1)
  assert.equal(merged.bob[0].id, "inbox-1")
})

test("canSendWsNow requires open socket and register", () => {
  assert.equal(canSendWsNow(true, true), true)
  assert.equal(canSendWsNow(true, false), false)
  assert.equal(canSendWsNow(false, true), false)
})

test("clearPendingRetryByClientMessageId clears DM and group events", () => {
  const pending = {
    a: { type: "send_message" as const, client_message_id: "c1" },
    b: { type: "send_group_message" as const, client_message_id: "c1" },
    c: { type: "send_message" as const, client_message_id: "c2" },
  }

  const next = clearPendingRetryByClientMessageId(pending, "c1")
  assert.equal(Object.keys(next).length, 1)
  assert.ok(next.c)
})

test("clientMessageIdFromPendingEvent reads DM and group sends", () => {
  assert.equal(
    clientMessageIdFromPendingEvent({ type: "send_message", client_message_id: "x" }),
    "x",
  )
  assert.equal(
    clientMessageIdFromPendingEvent({ type: "send_group_message", client_message_id: "y" }),
    "y",
  )
  assert.equal(clientMessageIdFromPendingEvent({ type: "ack" }), undefined)
})
