/**
 * Hardcoded schematic network for Prague metro.
 * Tram lines will be added once GTFS preprocessing is in place.
 */
import type { Line, Station, Segment } from '@/types'

export const LINES: Line[] = [
  { id: 'A', name: 'Metro A', color: '#00A073', type: 'metro' },
  { id: 'B', name: 'Metro B', color: '#FFD700', type: 'metro' },
  { id: 'C', name: 'Metro C', color: '#EF3E36', type: 'metro' },
]

// Schematic coords — viewBox 0 0 1000 700
export const STATIONS: Station[] = [
  // Line A
  { id: 'DL', name: 'Depo Letňany',    lineIds: ['A'], x: 820, y: 80,  isInterchange: false },
  { id: 'LD', name: 'Letňany',         lineIds: ['A'], x: 760, y: 120, isInterchange: false },
  { id: 'ST', name: 'Střížkov',        lineIds: ['A'], x: 700, y: 160, isInterchange: false },
  { id: 'PR', name: 'Prosek',          lineIds: ['A'], x: 640, y: 200, isInterchange: false },
  { id: 'HA', name: 'Háje (placeholder)', lineIds: ['A'], x: 580, y: 240, isInterchange: false },
  // Interchange
  { id: 'MS', name: 'Muzeum',          lineIds: ['A', 'C'], x: 500, y: 350, isInterchange: true },
  { id: 'IP', name: 'I. P. Pavlova',   lineIds: ['C'], x: 500, y: 420, isInterchange: false },
  // Line B
  { id: 'ZL', name: 'Zličín',          lineIds: ['B'], x: 100, y: 350, isInterchange: false },
  { id: 'NM', name: 'Nám. Míru',       lineIds: ['A'], x: 600, y: 350, isInterchange: false },
  // 3-line interchange
  { id: 'MC', name: 'Muzeum (C)',       lineIds: ['A', 'C'], x: 500, y: 350, isInterchange: true },
]

export const SEGMENTS: Segment[] = [
  {
    id: 'A-DL-LD', lineId: 'A',
    fromStationId: 'DL', toStationId: 'LD',
    waypoints: [],
  },
]

// TODO: replace with full schematic once Phase 3 data model is complete
