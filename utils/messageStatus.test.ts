import assert from "node:assert/strict"
import test from "node:test"

import { normalizeIncomingMessage } from "./chatMessageNormalize.ts"
import {
  appendMessageToPeer,
  applyLatestOutgoingSendingFailed,
  applyMessageQueued,
  applyOutgoingDelivered,
  applyOutgoingFailed,
  dmInboxAckIds,
  groupInboxAckIds,
  peerIdForMessage,
  planFailedMessageRetry,
} from "./messageStatus.ts"
import type { ChatMessage } from "./chatTypes.ts"

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, "id" | "from_user_id" | "to_user_id">): ChatMessage {
  return {
    text: "",
    created_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  }
}

test("normalizeIncomingMessage accepts legacy username fields", () => {
  const normalized = normalizeIncomingMessage({
    id: "m1",
    from_username: "alice",
    to_username: "bob",
    text: "hi",
    created_at: "2026-01-01T00:00:00.000Z",
  })

  assert.ok(normalized)
  assert.equal(normalized?.from_user_id, "alice")
  assert.equal(normalized?.to_user_id, "bob")
})

test("normalizeIncomingMessage rejects incomplete payloads", () => {
  assert.equal(normalizeIncomingMessage({ id: "m1", from_user_id: "alice" }), null)
})

test("appendMessageToPeer dedupes by id", () => {
  const first = msg({ id: "m1", from_user_id: "bob", to_user_id: "alice", text: "a" })
  const once = appendMessageToPeer({}, first, "alice")
  const twice = appendMessageToPeer(once, first, "alice")
  assert.equal(once.bob.length, 1)
  assert.equal(twice, once)
})

test("applyMessageQueued swaps client id to server id as sent", () => {
  const prev = {
    bob: [msg({
      id: "local-1",
      from_user_id: "alice",
      to_user_id: "bob",
      client_message_id: "local-1",
      delivery_status: "sending",
    })],
  }

  const result = applyMessageQueued(prev, "server-1", "local-1")
  assert.equal(result.changed, true)
  assert.equal(result.messagesByPeer.bob[0].id, "server-1")
  assert.equal(result.messagesByPeer.bob[0].delivery_status, "sent")
  assert.equal(result.peerMapUpdates["server-1"], "bob")
})

test("applyOutgoingDelivered marks own outbound as delivered", () => {
  const prev = {
    bob: [msg({
      id: "server-1",
      from_user_id: "alice",
      to_user_id: "bob",
      delivery_status: "sent",
    })],
  }

  const result = applyOutgoingDelivered(prev, { "server-1": "bob" }, "alice", "server-1")
  assert.equal(result.changed, true)
  assert.equal(result.messagesByPeer.bob[0].delivery_status, "delivered")
})

test("applyOutgoingFailed is idempotent for same reason", () => {
  const prev = {
    bob: [msg({
      id: "local-1",
      from_user_id: "alice",
      to_user_id: "bob",
      delivery_status: "failed",
      error_message: "timeout",
    })],
  }

  const result = applyOutgoingFailed(prev, "alice", {
    clientMessageId: "local-1",
    reason: "timeout",
  })
  assert.equal(result.changed, false)
})

test("applyLatestOutgoingSendingFailed targets newest sending", () => {
  const prev = {
    bob: [
      msg({
        id: "old",
        from_user_id: "alice",
        to_user_id: "bob",
        delivery_status: "sending",
        created_at: "2026-01-01T00:00:00.000Z",
      }),
      msg({
        id: "new",
        from_user_id: "alice",
        to_user_id: "bob",
        delivery_status: "sending",
        created_at: "2026-01-01T00:01:00.000Z",
      }),
    ],
  }

  const result = applyLatestOutgoingSendingFailed(prev, "alice", "boom")
  assert.equal(result.messagesByPeer.bob[0].delivery_status, "sending")
  assert.equal(result.messagesByPeer.bob[1].delivery_status, "failed")
  assert.equal(result.messagesByPeer.bob[1].error_message, "boom")
})

test("planFailedMessageRetry rebuilds sending event for own failed DM", () => {
  const prev = {
    bob: [msg({
      id: "failed-1",
      from_user_id: "alice",
      to_user_id: "bob",
      text: "hello",
      delivery_status: "failed",
      error_message: "timeout",
    })],
  }

  const plan = planFailedMessageRetry(prev, "alice", "failed-1", ["bob"], "local-retry")
  assert.ok(plan)
  assert.equal(plan?.messagesByPeer.bob[0].delivery_status, "sending")
  assert.equal(plan?.event.type, "send_message")
  if (plan?.event.type === "send_message") {
    assert.equal(plan.event.client_message_id, "local-retry")
  }
})

test("planFailedMessageRetry rejects strangers", () => {
  const prev = {
    eve: [msg({
      id: "failed-1",
      from_user_id: "alice",
      to_user_id: "eve",
      delivery_status: "failed",
    })],
  }

  assert.equal(planFailedMessageRetry(prev, "alice", "failed-1", ["bob"], "local-retry"), null)
})

test("inbox ack helpers select the right ids", () => {
  const messages = [
    msg({ id: "m1", from_user_id: "bob", to_user_id: "alice" }),
    msg({ id: "m2", from_user_id: "alice", to_user_id: "bob" }),
  ]
  assert.deepEqual(dmInboxAckIds(messages, "alice"), ["m1"])
  assert.deepEqual(groupInboxAckIds(messages), ["m1", "m2"])
})

test("peerIdForMessage uses group prefix", () => {
  assert.equal(
    peerIdForMessage(msg({
      id: "g1",
      from_user_id: "alice",
      to_user_id: "group:abc",
      group_id: "abc",
    }), "alice"),
    "group:abc",
  )
})
