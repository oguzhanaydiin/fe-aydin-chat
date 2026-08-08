import assert from "node:assert/strict"
import test from "node:test"

import {
  AuthApiError,
  isUnauthorizedError,
  isWsAuthError,
  unauthorizedRejectValue,
  SESSION_EXPIRED_MESSAGE,
} from "./authApiError.ts"

test("isUnauthorizedError is true only for AuthApiError 401", () => {
  assert.equal(isUnauthorizedError(new AuthApiError(401, "nope")), true)
  assert.equal(isUnauthorizedError(new AuthApiError(403, "nope")), false)
  assert.equal(isUnauthorizedError(new Error("401")), false)
  assert.equal(isUnauthorizedError(Object.assign(new Error("x"), { status: 401 })), false)
})

test("unauthorizedRejectValue maps 401 to session expired message", () => {
  assert.equal(unauthorizedRejectValue(new AuthApiError(401, "expired")), SESSION_EXPIRED_MESSAGE)
  assert.equal(unauthorizedRejectValue(new AuthApiError(500, "boom")), null)
  assert.equal(unauthorizedRejectValue(new Error("fail")), null)
})

test("isWsAuthError matches register auth failures only", () => {
  assert.equal(isWsAuthError("invalid token"), true)
  assert.equal(isWsAuthError("Invalid Token Claims"), true)
  assert.equal(isWsAuthError("token cannot be empty"), true)
  assert.equal(isWsAuthError("Failed to deliver message"), false)
  assert.equal(isWsAuthError("send register event first"), false)
})
