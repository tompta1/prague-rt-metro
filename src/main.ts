import '@/styles/main.css'
import { createMapSVG, updateVehicles } from '@/map/renderer'
import { subscribe, startPolling } from '@/data/store'
import type { Vehicle } from '@/types'

const app = document.getElementById('app')!

// ── Layout ───────────────────────────────────────────────────────────────────

const mapContainer = document.createElement('div')
mapContainer.className = 'map-container'

const loadingOverlay = document.createElement('div')
loadingOverlay.className = 'loading-overlay'
loadingOverlay.textContent = 'Loading live data…'

const statusBar = document.createElement('div')
statusBar.className = 'status-bar'

const liveIndicator = document.createElement('span')
liveIndicator.className = 'live-indicator'

const statusText = document.createElement('span')
statusText.textContent = 'Connecting…'

statusBar.appendChild(liveIndicator)
statusBar.appendChild(statusText)
mapContainer.appendChild(loadingOverlay)
app.appendChild(mapContainer)
app.appendChild(statusBar)

// ── Map ──────────────────────────────────────────────────────────────────────

const svg = createMapSVG(mapContainer)

// ── Realtime ─────────────────────────────────────────────────────────────────

let firstUpdate = true

subscribe((vehicles: Vehicle[]) => {
  if (firstUpdate) {
    firstUpdate = false
    loadingOverlay.classList.add('hidden')
    statusBar.classList.remove('error')
  }
  updateVehicles(svg, vehicles)
  statusText.textContent = `${vehicles.length} vehicles · updated ${new Date().toLocaleTimeString()}`
})

startPolling()
