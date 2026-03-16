import type { FormEvent } from "react"

type LoginViewProps = {
  emailInput: string
  otpInput: string
  otpEmail: string | null
  authLoading: boolean
  devOtpHint: string | null
  authError: string | null
  onEmailChange: (value: string) => void
  onOtpChange: (value: string) => void
  onSendOtp: (e: FormEvent) => void
  onVerifyOtp: (e: FormEvent) => void
}

export function LoginView({
  emailInput,
  otpInput,
  otpEmail,
  authLoading,
  devOtpHint,
  authError,
  onEmailChange,
  onOtpChange,
  onSendOtp,
  onVerifyOtp,
}: LoginViewProps) {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
        <h1 className="text-2xl font-bold text-blue-400">Aydin Chat Login</h1>
        <p className="mt-2 text-sm text-gray-400">Step one asks for email, step two verifies OTP.</p>

        <form onSubmit={onSendOtp} className="mt-6 space-y-3">
          <label className="text-sm text-gray-300 block">Email</label>
          <input
            value={emailInput}
            onChange={(e) => onEmailChange(e.target.value)}
            type="email"
            placeholder="sample@mail.com"
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            disabled={authLoading}
          />
          <button
            type="submit"
            disabled={authLoading}
            className="w-full rounded-lg bg-blue-600 py-2 font-semibold hover:bg-blue-500 disabled:opacity-60"
          >
            {authLoading ? "Sending..." : "Send OTP"}
          </button>
        </form>

        <form onSubmit={onVerifyOtp} className="mt-6 space-y-3">
          <label className="text-sm text-gray-300 block">OTP Code</label>
          <input
            value={otpInput}
            onChange={(e) => onOtpChange(e.target.value)}
            inputMode="numeric"
            placeholder="6 digit code"
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
            disabled={authLoading || !otpEmail}
          />
          <button
            type="submit"
            disabled={authLoading || !otpEmail}
            className="w-full rounded-lg bg-emerald-600 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-60"
          >
            {authLoading ? "Verifying..." : "Verify OTP"}
          </button>
        </form>

        {devOtpHint && (
          <p className="mt-4 rounded-lg border border-amber-700 bg-amber-950 px-3 py-2 text-xs text-amber-300">
            Development OTP: {devOtpHint}
          </p>
        )}

        {authError && (
          <p className="mt-4 rounded-lg border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
            {authError}
          </p>
        )}
      </section>
    </main>
  )
}
