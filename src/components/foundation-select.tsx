import type { CSSProperties, ReactNode } from "react"
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Check, ChevronDown, Search } from "lucide-react"
import clsx from "clsx"

export interface FoundationSelectOption {
  value: string
  label: ReactNode
  searchLabel?: string
  description?: ReactNode
  disabled?: boolean
}

export function FoundationSelect({
  label,
  value,
  options,
  placeholder = "Pilih data",
  disabled,
  searchable,
  className,
  renderValue,
  onChange,
}: {
  label: string
  value: string
  options: FoundationSelectOption[]
  placeholder?: string
  disabled?: boolean
  searchable?: boolean
  className?: string
  renderValue?: (option: FoundationSelectOption | undefined) => ReactNode
  onChange: (value: string) => void
}) {
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [position, setPosition] = useState<CSSProperties>({})
  const selectedOption = options.find((option) => option.value === value)
  const enableSearch = searchable ?? options.length > 8

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return options

    return options.filter((option) => {
      const searchableText = [
        option.searchLabel,
        typeof option.label === "string" ? option.label : "",
        typeof option.description === "string" ? option.description : "",
      ].join(" ").toLowerCase()

      return searchableText.includes(normalizedQuery)
    })
  }, [options, query])

  const syncPosition = () => {
    const button = buttonRef.current
    if (!button) return

    const rect = button.getBoundingClientRect()
    const viewportGap = 12
    const width = Math.min(Math.max(rect.width, 260), window.innerWidth - viewportGap * 2)
    const estimatedHeight = Math.min(enableSearch ? 390 : 330, window.innerHeight - viewportGap * 2)
    const top = rect.bottom + 8 + estimatedHeight > window.innerHeight
      ? Math.max(viewportGap, rect.top - estimatedHeight - 8)
      : rect.bottom + 8
    const left = Math.min(window.innerWidth - width - viewportGap, Math.max(viewportGap, rect.left))

    setPosition({
      position: "fixed",
      top,
      left,
      width,
      maxHeight: Math.min(estimatedHeight, window.innerHeight - top - viewportGap),
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    syncPosition()
  }, [open, value, options.length])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    const close = () => setOpen(false)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close()
    }

    window.addEventListener("pointerdown", handlePointerDown)
    window.addEventListener("resize", close)
    window.addEventListener("scroll", close, true)
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown)
      window.removeEventListener("resize", close)
      window.removeEventListener("scroll", close, true)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  const handleToggle = () => {
    if (disabled) return
    setQuery("")
    setOpen((current) => !current)
  }

  const handleSelect = (nextValue: string) => {
    onChange(nextValue)
    setOpen(false)
    setQuery("")
  }

  return (
    <span className={clsx("foundationSelect", className)}>
      <button
        ref={buttonRef}
        className="foundationSelectButton"
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        disabled={disabled}
        data-row-action="true"
        onClick={handleToggle}
      >
        <span className={clsx("foundationSelectValue", !selectedOption && !renderValue && "placeholder")}>
          {renderValue ? renderValue(selectedOption) : selectedOption?.label || placeholder}
        </span>
        <ChevronDown className="foundationSelectChevron" size={17} />
      </button>
      {open && createPortal(
        <div ref={menuRef} className="foundationSelectMenu" style={position} data-row-action="true">
          {enableSearch && (
            <label className="foundationSelectSearch">
              <Search size={15} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cari pilihan..." autoFocus />
            </label>
          )}
          <div id={`${id}-listbox`} className="foundationSelectList" role="listbox" aria-label={label}>
            {filteredOptions.length === 0 && <span className="foundationSelectEmpty">Tidak ada pilihan</span>}
            {filteredOptions.map((option) => {
              const selected = option.value === value
              const plainLabel = typeof option.label === "string" || typeof option.label === "number"
              return (
                <button
                  className={clsx("foundationSelectOption", selected && "selected")}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                >
                  <span className="foundationSelectOptionText">
                    {plainLabel ? <strong>{option.label}</strong> : option.label}
                    {option.description && <small>{option.description}</small>}
                  </span>
                  {selected && <Check size={16} />}
                </button>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </span>
  )
}
