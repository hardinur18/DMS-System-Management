import type { HTMLAttributes, ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import clsx from "clsx"

type SurfaceProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode
}

export function OperationalPageShell({ children, className, ...props }: SurfaceProps) {
  return (
    <div className={clsx("opsPageShell", className)} {...props}>
      {children}
    </div>
  )
}

export function OperationalPageHeader({
  title,
  subtitle,
  eyebrow,
  icon: Icon,
  actions,
  className,
}: {
  title: string
  subtitle?: ReactNode
  eyebrow?: string
  icon?: LucideIcon
  actions?: ReactNode
  className?: string
}) {
  return (
    <section className={clsx("topbar", className)}>
      <div className="topbarTitle">
        {(eyebrow || Icon) && (
          <div className="eyebrowLine">
            {Icon && <Icon size={16} />}
            {eyebrow}
          </div>
        )}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="topbarActions">{actions}</div>}
    </section>
  )
}

export function OperationalKpiGrid({ children, className, ...props }: SurfaceProps) {
  return (
    <section className={clsx("metricGrid", className)} {...props}>
      {children}
    </section>
  )
}

export function OperationalKpiCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "default",
}: {
  label: string
  value: ReactNode
  detail?: ReactNode
  icon?: LucideIcon
  tone?: "default" | "blue" | "green" | "amber" | "rose" | "violet"
}) {
  return (
    <article className={clsx("metricCard", tone)}>
      {Icon && (
        <span className="metricIcon">
          <Icon size={20} />
        </span>
      )}
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        {detail && <em>{detail}</em>}
      </span>
    </article>
  )
}

export function OperationalFilterPanel({ children, className, ...props }: SurfaceProps) {
  return (
    <section className={clsx("surfacePanel filterPanel uiFilterCard", className)} {...props}>
      {children}
    </section>
  )
}

export function OperationalTableCard({ children, className, ...props }: SurfaceProps) {
  return (
    <section className={clsx("tablePanel", className)} {...props}>
      {children}
    </section>
  )
}
