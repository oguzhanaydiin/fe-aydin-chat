import assert from "node:assert/strict"
import test from "node:test"

import { resolveHydratedSession } from "./authHydrate.ts"

const baseSession = {
  userId: "507f1f77bcf86cd799439011",
  token: "valid-token",
  email: "user@example.com",
  username: "alice",
  needsUsernameSetup: false,
  avatar_data_url: null as string | null,
}

test("resolveHydratedSession keeps session and refreshes profile on success", async () => {
  const result = await resolveHydratedSession(baseSession, async () => ({
    username: "alice",
    email: "User@Example.com",
    avatar_data_url: "data:image/png;base64,abc",
  }))

  assert.equal(result.status, "ok")
  if (result.status !== "ok") {
    return
  }

  assert.equal(result.session.email, "user@example.com")
  assert.equal(result.session.username, "alice")
  assert.equal(result.session.needsUsernameSetup, false)
  assert.equal(result.session.avatar_data_url, "data:image/png;base64,abc")
})

test("resolveHydratedSession clears path when profile returns 401", async () => {
  const result = await resolveHydratedSession(baseSession, async () => {
    const err = Object.assign(new Error("Invalid or expired token"), { status: 401 })
    throw err
  })

  assert.equal(result.status, "unauthorized")
})

test("resolveHydratedSession keeps local session on network errors", async () => {
  const result = await resolveHydratedSession(baseSession, async () => {
    throw new Error("Failed to fetch")
  })

  assert.equal(result.status, "offline")
  if (result.status !== "offline") {
    return
  }

  assert.equal(result.session.token, "valid-token")
  assert.equal(result.session.username, "alice")
})

test("resolveHydratedSession marks username setup when profile has no username", async () => {
  const result = await resolveHydratedSession(
    { ...baseSession, username: null, needsUsernameSetup: true },
    async () => ({
      username: "",
      email: "user@example.com",
    }),
  )

  assert.equal(result.status, "ok")
  if (result.status !== "ok") {
    return
  }

  assert.equal(result.session.username, null)
  assert.equal(result.session.needsUsernameSetup, true)
})
