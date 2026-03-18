import '@/styles/main.css'
import { createMapSVG, setVehicleTargets, startAnimation } from '@/map/renderer'
import { initGtfsLayer, onStationClick } from '@/map/gtfs-layer'
import { subscribe, startPolling } from '@/data/store'
import { fetchDepartures } from '@/data/fetcher'
import { FetchError } from '@/core/errors'
import { DeparturePanel } from '@/ui/panel'

const app = document.getElementById('app')!

// ── Layout ────────────────────────────────────────────────────────────────────

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

// ── Map ───────────────────────────────────────────────────────────────────────

const svg = createMapSVG(mapContainer)
startAnimation()
void initGtfsLayer(svg)

// ── Departure panel ───────────────────────────────────────────────────────────

const panel = new DeparturePanel(mapContainer, fetchDepartures)

onStationClick((name, lineIds) => {
  panel.show(name, lineIds)
})

svg.addEventListener('click', e => {
  if ((e.target as Element).closest('.metro-station') === null) {
    panel.hide()
  }
})

// ── Realtime ──────────────────────────────────────────────────────────────────

let pollCount = 0

subscribe((vehicles, error) => {
  if (++pollCount > 1) loadingOverlay.classList.add('hidden')

  if (error) {
    statusBar.classList.add('error')
    const qualifier = error instanceof FetchError
      ? (error.status === 0 ? ' (timeout)' : error.status === 429 ? ' (rate limit)' : error.status >= 500 ? ' (server)' : '')
      : ''
    statusText.textContent = `Connection error${qualifier} · ${new Date().toLocaleTimeString()}`
  } else {
    statusBar.classList.remove('error')
    setVehicleTargets(svg, vehicles)
    statusText.textContent = `${vehicles.length} vehicles · updated ${new Date().toLocaleTimeString()}`
  }
})

startPolling()
