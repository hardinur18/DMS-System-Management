import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"
import clsx from "clsx"

type FoundationCachedDataRecord<TData> = {
  cachedAt: number
  data: TData
}

type FoundationCachedDataLoadOptions<TData> = {
  cacheKey?: string
  load?: () => Promise<TData>
  silent?: boolean
}

type FoundationCachedDataUpdater<TData> = TData | ((current: TData) => TData)

const foundationCachedData = new Map<string, FoundationCachedDataRecord<unknown>>()

export function FoundationSkeleton({ className }: { className?: string }) {
  return <span className={clsx("foundationSkeleton", className)} aria-hidden="true" />
}

export function getFoundationCachedData<TData>(cacheKey: string): TData | null {
  return (foundationCachedData.get(cacheKey)?.data as TData | undefined) ?? null
}

export function setFoundationCachedData<TData>(cacheKey: string, data: TData) {
  foundationCachedData.set(cacheKey, { cachedAt: Date.now(), data })
}

export function clearFoundationCachedData(cacheKey?: string) {
  if (cacheKey) {
    foundationCachedData.delete(cacheKey)
    return
  }

  foundationCachedData.clear()
}

export function useFoundationCachedData<TData>({
  cacheKey,
  createInitialData,
  load,
  revalidateOnCache = false,
}: {
  cacheKey: string
  createInitialData: () => TData
  load: () => Promise<TData>
  revalidateOnCache?: boolean
}) {
  const initialCachedData = getFoundationCachedData<TData>(cacheKey)
  const [data, setData] = useState<TData>(() => initialCachedData ?? createInitialData())
  const [loading, setLoading] = useState(() => !initialCachedData)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const cacheKeyRef = useRef(cacheKey)
  const loadRef = useRef(load)
  const requestIdRef = useRef(0)
  const mountedRef = useRef(false)

  cacheKeyRef.current = cacheKey
  loadRef.current = load

  const commit = useCallback((nextData: FoundationCachedDataUpdater<TData>, targetCacheKey = cacheKeyRef.current) => {
    if (!mountedRef.current) {
      if (typeof nextData !== "function") setFoundationCachedData(targetCacheKey, nextData)
      return
    }

    setData((current) => {
      const resolved = typeof nextData === "function" ? (nextData as (currentData: TData) => TData)(current) : nextData
      setFoundationCachedData(targetCacheKey, resolved)
      return resolved
    })
  }, [])

  const reload = useCallback(async (options: FoundationCachedDataLoadOptions<TData> = {}) => {
    const targetCacheKey = options.cacheKey || cacheKeyRef.current
    const hasCachedData = foundationCachedData.has(targetCacheKey)
    const silent = options.silent ?? hasCachedData
    const requestId = requestIdRef.current + 1
    const loader = options.load || loadRef.current

    requestIdRef.current = requestId
    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)

    try {
      const nextData = await loader()
      if (mountedRef.current && requestIdRef.current === requestId) commit(nextData, targetCacheKey)
      return nextData
    } catch (caughtError) {
      if (mountedRef.current && requestIdRef.current === requestId) setError(caughtError)
      throw caughtError
    } finally {
      if (mountedRef.current && requestIdRef.current === requestId) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [commit])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      requestIdRef.current += 1
    }
  }, [])

  useEffect(() => {
    const cachedData = getFoundationCachedData<TData>(cacheKey)

    if (cachedData) {
      setData(cachedData)
      setLoading(false)
      setRefreshing(false)
      setError(null)
      if (revalidateOnCache) void reload({ silent: true }).catch(() => {})
      return
    }

    setData(createInitialData())
    void reload({ silent: false }).catch(() => {})
  }, [cacheKey, createInitialData, reload, revalidateOnCache])

  return { data, loading, refreshing, error, reload, commit }
}

function getTableSkeletonTemplate(columns: number) {
  if (columns === 7) return "44px 140px 190px minmax(220px, 1fr) 100px 128px 28px"
  if (columns === 8) return "44px 140px 180px minmax(220px, 1fr) 120px 120px 120px 28px"
  if (columns === 10) return "44px minmax(170px, 1.2fr) minmax(112px, 0.8fr) minmax(112px, 0.8fr) minmax(140px, 1fr) minmax(112px, 0.8fr) 76px minmax(110px, 0.8fr) 82px 28px"
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
