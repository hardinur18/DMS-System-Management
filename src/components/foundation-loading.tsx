import type { CSSProperties } from "react"
import clsx from "clsx"

export function FoundationSkeleton({ className }: { className?: string }) {
  return <span className={clsx("foundationSkeleton", className)} aria-hidden="true" />
}

function getTableSkeletonTemplate(columns: number) {
  if (columns === 7) return "44px 140px 190px minmax(220px, 1fr) 100px 128px 28px"
  if (columns === 8) return "44px 140px 180px minmax(220px, 1fr) 120px 120px 120px 28px"
  return `repeat(${Math.max(1, columns)}, minmax(72px, 1fr))`
}

export function FoundationTableSkeletonRows({
  colSpan,
  columns = 6,
  rows = 4,
}: {
  colSpan: number
  columns?: number
  rows?: number
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr className="foundationTableSkeletonRow" key={rowIndex} aria-hidden="true">
          <td colSpan={colSpan}>
            <div className="foundationTableSkeletonGrid" style={{ gridTemplateColumns: getTableSkeletonTemplate(columns) } as CSSProperties}>
              {Array.from({ length: columns }).map((__, columnIndex) => (
                <FoundationSkeleton className={clsx("table", columnIndex === 0 && "short", columnIndex === columns - 1 && "dot")} key={columnIndex} />
              ))}
            </div>
          </td>
        </tr>
      ))}
    </>
  )
}
