import type { ReactNode } from "react"
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
  return (
    <nav className="masterCategoryStrip" aria-label={ariaLabel}>
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
