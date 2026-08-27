import { useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import clsx from "clsx"

export interface CategoryTabItem<TId extends string> {
  id: TId
  label: ReactNode
  icon?: LucideIcon
  count?: ReactNode
}

export function CategoryTabs<TId extends string>({
  items,
  activeId,
  ariaLabel,
  onChange,
}: {
  items: CategoryTabItem<TId>[]
  activeId: TId
  ariaLabel: string
  onChange: (id: TId) => void
}) {
  const stripRef = useRef<HTMLElement | null>(null)
  const dragStateRef = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    suppressClickUntil: 0,
  })
  const [dragging, setDragging] = useState(false)

  const finishDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const node = stripRef.current
    const dragState = dragStateRef.current
    if (!dragState.active || dragState.pointerId !== event.pointerId) return

    dragState.active = false
    dragState.pointerId = -1
    if (dragState.moved) dragState.suppressClickUntil = Date.now() + 160
    setDragging(false)
    if (node?.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId)
  }

  return (
    <nav
      className={clsx("masterCategoryStrip", dragging && "dragging")}
      ref={stripRef}
      aria-label={ariaLabel}
      onPointerDown={(event) => {
        const node = stripRef.current
        if (!node || node.scrollWidth <= node.clientWidth) return
        if (event.pointerType === "mouse" && event.button !== 0) return

        dragStateRef.current = {
          active: true,
          moved: false,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          scrollLeft: node.scrollLeft,
          suppressClickUntil: dragStateRef.current.suppressClickUntil,
        }
      }}
      onPointerMove={(event) => {
        const node = stripRef.current
        const dragState = dragStateRef.current
        if (!node || !dragState.active || dragState.pointerId !== event.pointerId) return

        const deltaX = event.clientX - dragState.startX
        const deltaY = event.clientY - dragState.startY
        if (!dragState.moved) {
          if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return
          if (Math.abs(deltaX) <= Math.abs(deltaY)) {
            finishDrag(event)
            return
          }
          dragState.moved = true
          if (!node.hasPointerCapture(event.pointerId)) node.setPointerCapture(event.pointerId)
          setDragging(true)
        }

        node.scrollLeft = dragState.scrollLeft - deltaX
        if (dragState.moved) event.preventDefault()
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onPointerLeave={finishDrag}
      onClickCapture={(event: ReactMouseEvent<HTMLElement>) => {
        if (Date.now() > dragStateRef.current.suppressClickUntil) return
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {items.map((item) => {
        const Icon = item.icon

        return (
          <button
            className={clsx("masterCategoryButton", activeId === item.id && "active")}
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
          >
            {Icon && <Icon size={15} />}
            <span>{item.label}</span>
            {item.count !== undefined && <em>{item.count}</em>}
          </button>
        )
      })}
    </nav>
  )
}
