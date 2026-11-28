import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./App"
import "./styles.css"

const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000

function AppUpdatePrompt() {
  const [availableBuildId, setAvailableBuildId] = React.useState("")
  const [dismissedBuildId, setDismissedBuildId] = React.useState("")

  React.useEffect(() => {
    if (!import.meta.env.PROD) return

    let active = true

    const checkForUpdate = async () => {
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" })
        if (!response.ok) return

        const version = await response.json() as { buildId?: unknown }
        const nextBuildId = typeof version.buildId === "string" ? version.buildId : ""

        if (active && nextBuildId && nextBuildId !== __APP_BUILD_ID__) {
          setAvailableBuildId(nextBuildId)
        }
      } catch {
        // An update check should never interrupt normal DMS usage.
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void checkForUpdate()
    }

    void checkForUpdate()
    const intervalId = window.setInterval(() => void checkForUpdate(), UPDATE_CHECK_INTERVAL_MS)
    window.addEventListener("focus", checkForUpdate)
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      active = false
      window.clearInterval(intervalId)
      window.removeEventListener("focus", checkForUpdate)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  if (!availableBuildId || dismissedBuildId === availableBuildId) return null

  return (
    <aside className="appUpdatePrompt" role="status" aria-live="polite" aria-label="Pembaruan aplikasi tersedia">
      <span className="appUpdatePromptIcon" aria-hidden="true">&#8635;</span>
      <div className="appUpdatePromptCopy">
        <strong>Versi baru DMS tersedia</strong>
        <span>Muat ulang untuk menggunakan pembaruan terbaru.</span>
      </div>
      <button className="appUpdatePromptLater" type="button" onClick={() => setDismissedBuildId(availableBuildId)}>
        Nanti
      </button>
      <button className="appUpdatePromptReload" type="button" onClick={() => window.location.reload()}>
        Muat Ulang Sekarang
      </button>
    </aside>
  )
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <AppUpdatePrompt />
  </React.StrictMode>,
)

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined)
  })
}
