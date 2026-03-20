import type { ReactNode } from "react"

type GenericModalProps = {
  isOpen: boolean
  title: string
  onClose: () => void
  children: ReactNode
  panelClassName?: string
  bodyClassName?: string
}

export function GenericModal({
  isOpen,
  title,
  onClose,
  children,
  panelClassName,
  bodyClassName,
}: GenericModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className={`w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-4 shadow-2xl ${panelClassName ?? ""}`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h4 className="text-lg font-bold text-blue-300">{title}</h4>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800"
          >
            Close
          </button>
        </div>

        <div className={bodyClassName}>{children}</div>
      </div>
    </div>
  )
}
