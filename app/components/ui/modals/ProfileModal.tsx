"use client"
import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { GenericModal } from "@/app/components/ui/modals/GenericModal"
import { getUserProfile } from "@/utils/chatApi"
import type { PublicProfile } from "@/utils/chatTypes"

const MAX_AVATAR_BYTES = 512 * 1024 // 512 KB

async function compressAvatarToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const MAX_DIM = 256
      let { width, height } = img

      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) {
          height = Math.round((height * MAX_DIM) / width)
          width = MAX_DIM
        } else {
          width = Math.round((width * MAX_DIM) / height)
          height = MAX_DIM
        }
      }

      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        reject(new Error("Canvas not supported"))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)

      // Binary search for quality that fits within MAX_AVATAR_BYTES
      let lo = 0.1
      let hi = 0.95
      let result = canvas.toDataURL("image/webp", 0.8)

      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2
        const candidate = canvas.toDataURL("image/webp", mid)
        if (candidate.length <= MAX_AVATAR_BYTES) {
          result = candidate
          lo = mid
        } else {
          hi = mid
        }
      }

      if (result.length > MAX_AVATAR_BYTES) {
        reject(new Error("Image is too large even after compression. Try a smaller image."))
        return
      }

      resolve(result)
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error("Failed to load image."))
    }

    img.src = objectUrl
  })
}

function AvatarPlaceholder({ username }: { username: string }) {
  return (
    <div className="h-20 w-20 rounded-full bg-gray-700 flex items-center justify-center text-2xl font-bold text-blue-400 border-2 border-gray-600 select-none">
      {username.charAt(0).toUpperCase()}
    </div>
  )
}

// â”€â”€â”€ Own profile (editable) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type OwnProfileModalProps = {
  isOpen: boolean
  username: string
  email: string
  avatarDataUrl?: string | null
  loading?: boolean
  error?: string | null
  onClose: () => void
  onSave: (avatarDataUrl: string | null) => void
}

export function OwnProfileModal({
  isOpen,
  username,
  email,
  avatarDataUrl: initialAvatarDataUrl,
  loading,
  error,
  onClose,
  onSave,
}: OwnProfileModalProps) {
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(initialAvatarDataUrl ?? null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setAvatarDataUrl(initialAvatarDataUrl ?? null)
      setAvatarError(null)
    })

    return () => {
      cancelled = true
    }
  }, [isOpen, initialAvatarDataUrl])

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return

    if (!file.type.startsWith("image/")) {
      setAvatarError("Please select an image file.")
      return
    }

    setAvatarLoading(true)
    setAvatarError(null)

    try {
      const dataUrl = await compressAvatarToDataUrl(file)
      setAvatarDataUrl(dataUrl)
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Failed to process image.")
    } finally {
      setAvatarLoading(false)
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(avatarDataUrl)
  }

  return (
    <GenericModal isOpen={isOpen} title="Your Profile" onClose={onClose}>
      <div className="flex flex-col items-center gap-4 p-1">
        {/* Avatar */}
        <div className="relative">
          {avatarDataUrl ? (
            <Image
              src={avatarDataUrl}
              alt="Your avatar"
              width={80}
              height={80}
              unoptimized
              className="h-20 w-20 rounded-full object-cover border-2 border-gray-600"
            />
          ) : (
            <AvatarPlaceholder username={username} />
          )}
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            className="absolute bottom-0 right-0 h-6 w-6 rounded-full bg-blue-600 text-sm text-white flex items-center justify-center hover:bg-blue-500 border border-gray-900 disabled:opacity-50"
            title="Change avatar"
            disabled={avatarLoading}
          >
            âœ
          </button>
        </div>
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onAvatarChange}
        />

        {avatarError && (
          <p className="text-xs text-red-300 rounded-md border border-red-900 bg-red-950 px-2 py-1.5 w-full text-center">
            {avatarError}
          </p>
        )}

        {avatarLoading && (
          <p className="text-xs text-gray-400">Processing image...</p>
        )}

        {/* Username + Email fields */}
        <form onSubmit={onSubmit} className="w-full space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Username</label>
            <input
              type="text"
              value={username}
              readOnly
              className="w-full rounded-lg bg-gray-700/50 border border-gray-600 px-3 py-2 text-sm text-white cursor-default outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Email</label>
            <input
              type="email"
              value={email}
              readOnly
              className="w-full rounded-lg bg-gray-700/50 border border-gray-600 px-3 py-2 text-sm text-gray-300 cursor-default outline-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-300 rounded-md border border-red-900 bg-red-950 px-2 py-1.5">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || avatarLoading}
            className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
          >
            {loading ? "Saving..." : "Save Profile"}
          </button>
        </form>
      </div>
    </GenericModal>
  )
}

// â”€â”€â”€ Peer profile (read-only, fetched on open) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type PeerProfileModalProps = {
  isOpen: boolean
  username: string
  token: string
  onClose: () => void
}

export function PeerProfileModal({ isOpen, username, token, onClose }: PeerProfileModalProps) {
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [fetchLoading, setFetchLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !username) {
      return
    }

    let cancelled = false

    queueMicrotask(() => {
      if (cancelled) return
      setProfile(null)
      setFetchError(null)
      setFetchLoading(true)
    })

    getUserProfile(token, username)
      .then((data) => {
        if (!cancelled) setProfile(data)
      })
      .catch((err) => {
        if (!cancelled) setFetchError(err instanceof Error ? err.message : "Failed to load profile")
      })
      .finally(() => {
        if (!cancelled) setFetchLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, username, token])

  return (
    <GenericModal isOpen={isOpen} title={`${username}'s Profile`} onClose={onClose}>
      <div className="flex flex-col items-center gap-4 p-1 min-h-[140px]">
        {fetchLoading && (
          <p className="text-sm text-gray-400 mt-4">Loading...</p>
        )}

        {fetchError && !fetchLoading && (
          <p className="text-sm text-red-300 rounded-md border border-red-900 bg-red-950 px-2 py-1.5 w-full text-center mt-4">
            {fetchError}
          </p>
        )}

        {profile && !fetchLoading && (
          <>
            {profile.avatar_data_url ? (
              <Image
                src={profile.avatar_data_url}
                alt={`${username}'s avatar`}
                width={80}
                height={80}
                unoptimized
                className="h-20 w-20 rounded-full object-cover border-2 border-gray-600"
              />
            ) : (
              <AvatarPlaceholder username={username} />
            )}

            <p className="text-lg font-bold text-white">{profile.username}</p>
          </>
        )}
      </div>
    </GenericModal>
  )
}
