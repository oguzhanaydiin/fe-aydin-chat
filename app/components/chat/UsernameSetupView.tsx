import type { FormEvent } from "react"

type UsernameSetupViewProps = {
  usernameInput: string
  usernameLoading: boolean
  usernameError: string | null
  onUsernameChange: (value: string) => void
  onSaveUsername: (e: FormEvent) => void
  onLogout: () => void
}

export function UsernameSetupView({
  usernameInput,
  usernameLoading,
  usernameError,
  onUsernameChange,
  onSaveUsername,
  onLogout,
}: UsernameSetupViewProps) {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
        <h1 className="text-2xl font-bold text-emerald-400">Welcome</h1>
        <p className="mt-2 text-sm text-gray-400">
          OTP is verified. Set your username once to complete your account.
        </p>

        <form onSubmit={onSaveUsername} className="mt-6 space-y-3">
          <label className="text-sm text-gray-300 block">Username</label>
          <input
            value={usernameInput}
            onChange={(e) => onUsernameChange(e.target.value)}
            placeholder="your-username"
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500"
            disabled={usernameLoading}
          />
          <button
            type="submit"
            disabled={usernameLoading}
            className="w-full rounded-lg bg-emerald-600 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-60"
          >
            {usernameLoading ? "Saving..." : "Complete Setup"}
          </button>
        </form>

        {usernameError && (
          <p className="mt-4 rounded-lg border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
            {usernameError}
          </p>
        )}

        <button
          type="button"
          onClick={onLogout}
          className="mt-4 w-full rounded-lg border border-gray-700 py-2 text-sm text-gray-300 hover:bg-gray-800"
        >
          Logout
        </button>
      </section>
    </main>
  )
}
