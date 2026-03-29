import { GenericModal } from "@/app/components/ui/modals/GenericModal"

type ConfirmModalProps = {
  isOpen: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  intent?: "danger" | "primary"
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({
  isOpen,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  intent = "danger",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmClassName =
    intent === "primary"
      ? "rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-500"
      : "rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-500"

  return (
    <GenericModal isOpen={isOpen} title={title} onClose={onCancel}>
      {description ? <p className="mb-4 text-sm text-gray-300">{description}</p> : null}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-200 transition hover:bg-gray-800"
        >
          {cancelText}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={confirmClassName}
        >
          {confirmText}
        </button>
      </div>
    </GenericModal>
  )
}
