import type { ReactNode } from "react"

type AccordionSectionProps = {
  title: string
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
  className?: string
  headerClassName?: string
  titleClassName?: string
  contentClassName?: string
  headerActions?: ReactNode
  toggleAriaLabel?: string
}

export function AccordionSection({
  title,
  isOpen,
  onToggle,
  children,
  className,
  headerClassName,
  titleClassName,
  contentClassName,
  headerActions,
  toggleAriaLabel,
}: AccordionSectionProps) {
  return (
    <div className={className}>
      <div className={headerClassName}>
        <p className={titleClassName}>{title}</p>
        <div className="flex items-center gap-2">
          {headerActions}
          <button
            type="button"
            aria-expanded={isOpen}
            aria-label={toggleAriaLabel ?? (isOpen ? `Collapse ${title}` : `Expand ${title}`)}
            onClick={onToggle}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-600/60 text-xs leading-none text-slate-200 transition hover:bg-slate-800/60"
          >
            {isOpen ? "-" : "+"}
          </button>
        </div>
      </div>
      {isOpen ? <div className={contentClassName}>{children}</div> : null}
    </div>
  )
}
