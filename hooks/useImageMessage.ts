import { useCallback } from "react"
import { BACKEND_MAX_WS_IMAGE_DATA_URL_LENGTH } from "@/lib/chat/constants"

interface UseImageMessageOptions {
  targetUser: string | null
  userId: string
  sendImageMessage: (toUserId: string, imageDataUrl: string) => void
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === "string") {
        resolve(result)
        return
      }

      reject(new Error("Invalid file data"))
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read file"))
    }
    reader.readAsDataURL(file)
  })
}

function loadImageFromDataUrl(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Failed to load image"))
    image.src = dataUrl
  })
}

async function optimizeImageForMessage(file: File) {
  const sourceDataUrl = await fileToDataUrl(file)
  const image = await loadImageFromDataUrl(sourceDataUrl)

  const maxImageDataUrlLength = Number(process.env.NEXT_PUBLIC_WS_MAX_IMAGE_DATA_URL_LENGTH)
  const targetMaxDataUrlLength = Number.isFinite(maxImageDataUrlLength) && maxImageDataUrlLength > 4096
    ? Math.floor(maxImageDataUrlLength)
    : BACKEND_MAX_WS_IMAGE_DATA_URL_LENGTH
  const maxDataUrlLength = Math.max(4096, targetMaxDataUrlLength - 512)
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return sourceDataUrl
  }

  const maxSide = Math.max(image.width, image.height)
  const dimensionCaps = [1280, 1120, 960, 840, 720, 640, 560, 480, 400, 320]

  const encodeWithinTarget = (mimeType: "image/webp" | "image/jpeg") => {
    let low = 0.3
    let high = 0.95
    let best = ""

    for (let i = 0; i < 8; i += 1) {
      const quality = (low + high) / 2
      const output = canvas.toDataURL(mimeType, quality)

      if (output.length <= maxDataUrlLength) {
        best = output
        low = quality
      } else {
        high = quality
      }
    }

    return best
  }

  for (const cap of dimensionCaps) {
    const scale = Math.min(1, cap / maxSide)
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))

    canvas.width = width
    canvas.height = height
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)

    const webpOutput = encodeWithinTarget("image/webp")
    if (webpOutput) {
      return webpOutput
    }

    const jpegOutput = encodeWithinTarget("image/jpeg")
    if (jpegOutput) {
      return jpegOutput
    }
  }

  throw new Error("Image is still too large after optimization")
}

export function useImageMessage({
  targetUser,
  userId,
  sendImageMessage,
}: UseImageMessageOptions) {
  const onSendImage = useCallback(async (file: File) => {
    if (!targetUser || !userId) {
      return
    }

    if (!file.type.startsWith("image/")) {
      return
    }

    const maxSourceImageSizeBytes = 20 * 1024 * 1024
    if (file.size > maxSourceImageSizeBytes) {
      window.alert("Image is too large. Please choose a file smaller than 20MB.")
      return
    }

    try {
      const imageDataUrl = await optimizeImageForMessage(file)

      if (imageDataUrl.length > BACKEND_MAX_WS_IMAGE_DATA_URL_LENGTH) {
        window.alert("Image is too large for chat image limit. Try a smaller image.")
        return
      }

      sendImageMessage(targetUser, imageDataUrl)
    } catch {
      window.alert("Image could not be prepared for sending. Try a smaller image.")
    }
  }, [sendImageMessage, targetUser, userId])

  return { onSendImage }
}
