import Image from "next/image"

type AvatarBadgeProps = {
  src?: string | null
  label: string
  className?: string
  sizeClassName?: string
  imageClassName?: string
  fallbackClassName?: string
  fallbackTextClassName?: string
}

function resolveAvatarGlyph(label: string) {
  const normalized = label.trim()
  if (!normalized) {
    return "?"
  }

  return normalized.charAt(0).toUpperCase()
}

export function AvatarBadge({
  src,
  label,
  className = "",
  sizeClassName = "h-7 w-7",
  imageClassName = "border border-gray-600 object-cover",
  fallbackClassName = "bg-gray-600 border border-gray-500",
  fallbackTextClassName = "text-blue-300",
}: AvatarBadgeProps) {
  const glyph = resolveAvatarGlyph(label)

  if (src) {
    return (
      <Image
        src={src}
        alt={`${label} avatar`}
        width={28}
        height={28}
        unoptimized
        className={`${sizeClassName} shrink-0 rounded-full ${imageClassName} ${className}`.trim()}
      />
    )
  }

  return (
    <div
      aria-label={`${label} avatar fallback`}
      className={`${sizeClassName} shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${fallbackClassName} ${fallbackTextClassName} ${className}`.trim()}
    >
      {glyph}
    </div>
  )
}
