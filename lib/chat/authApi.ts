import type { AuthSessionResponse, SaveUsernameResponse, SendOtpResponse } from "@/lib/chat/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8080"

export async function requestOtp(email: string): Promise<SendOtpResponse> {
  const response = await fetch(`${API_URL}/otp/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to send OTP")
  }

  return (await response.json()) as SendOtpResponse
}

export async function verifyOtp(email: string, otp: string): Promise<AuthSessionResponse> {
  const response = await fetch(`${API_URL}/otp/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to verify OTP")
  }

  return (await response.json()) as AuthSessionResponse
}

export async function saveUsername(token: string, username: string): Promise<SaveUsernameResponse> {
  const response = await fetch(`${API_URL}/users/username`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ username }),
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || "Failed to save username")
  }

  return (await response.json()) as SaveUsernameResponse
}
