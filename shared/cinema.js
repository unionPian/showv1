export const ROWS = 8
export const PER_SIDE = 6
export const SEAT_GAP_X = 0.62
export const AISLE = 0.64
export const ROW_GAP = 0.86
export const ROW_RISE = 0.1
export const ROW_Z0 = -3.55
export const TOTAL_SEATS = ROWS * PER_SIDE * 2

export const SCREEN = {
  w: 7.6,
  h: (7.6 * 9) / 16,
  z: -7.7,
  cy: 3.05,
}

export const CAMERA = {
  position: [0, 5.05, 5.05],
  target: [0, 1.45, -4.4],
  fov: 48,
}

export const VIEWPOINTS = [
  { id: 'theater', label: 'Toàn rạp', position: [0, 5.05, 5.05], target: [0, 1.45, -4.4] },
  { id: 'screen', label: 'Màn hình', position: [0, 2.55, 0.15], target: [0, 2.95, -7.55] },
  { id: 'aisle', label: 'Lối đi', position: [3.85, 2.15, 3.5], target: [-0.6, 1.15, -1.6] },
  { id: 'crowd', label: 'Khán giả', position: [0, 2.35, -6.2], target: [0, 1.15, 2.4] },
  { id: 'seat', label: 'Ghế tôi', position: [0, 1.85, -0.4], target: [0, 2.15, -7.3] },
]

export const SEAT_FACE = {
  colors: ['#3e6e67', '#1f4e46', '#8d4b4b', '#3d4f86', '#6b4c7a', '#8a6a32', '#243028', '#c45c6a', '#d7c4a3', '#1c1c1c'],
  inks: ['#f4f1ea', '#1a1a1a', '#ffd36a', '#ff7ad9', '#7dffb2', '#9fd4ff'],
  styles: ['plain', 'stripe', 'quilt', 'velvet'],
}

export const LOOK = {
  shirts: ['#e6d3ad', '#cbb6f2', '#8fd0c0', '#f0c2d2', '#e7d39a', '#b9d7f5', '#e8b89a', '#d5d8c8', '#f2b6a0', '#9eb8d6', '#f4f1ea', '#c7d7b8'],
  hair: ['#1b1b1b', '#2a211c', '#111111', '#3a2a22', '#4a3428', '#242428', '#6b3a22', '#c4a574'],
  pants: ['#2c3136', '#1c2430', '#3c3228', '#243028', '#4a3228', '#151515'],
  skin: ['#f6d3b4', '#e0a67a', '#c68642', '#8d5524', '#ffd8c2', '#a56b45'],
  styles: ['short', 'long', 'bun', 'cap'],
}

export const ROOM = {
  halfW: 5.75,
  height: 7.15,
  backZ: 10.6,
}

export const ROOM_THEME = {
  walls: '#14161a',
  wallLight: '#e8c98a',
  stage: '#2c3136',
  speaker: '#171717',
  frame: '#0c0f0d',
  seats: '#3e6e67',
}

const THEME_KEYS = Object.keys(ROOM_THEME)

export function cleanTheme(input, base = ROOM_THEME) {
  const next = { ...base }
  if (!input || typeof input !== 'object') return next
  for (const key of THEME_KEYS) {
    const value = String(input[key] || '').trim()
    if (/^#[0-9a-fA-F]{6}$/.test(value)) next[key] = value.toLowerCase()
  }
  return next
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function seatLabel(id) {
  const match = /^r(\d+)-([LR])(\d+)$/.exec(id || '')
  if (!match) return String(id || '')
  const row = LETTERS[Number(match[1])] || '?'
  const side = match[2]
  const col = Number(match[3])
  const num = side === 'L' ? PER_SIDE - col : PER_SIDE + 1 + col
  return `${row}${num}`
}

export function isValidSeat(id) {
  const match = /^r(\d+)-([LR])(\d+)$/.exec(id || '')
  if (!match) return false
  const row = Number(match[1])
  const col = Number(match[3])
  return row >= 0 && row < ROWS && col >= 0 && col < PER_SIDE
}

export const SEATS = []
for (let row = 0; row < ROWS; row++) {
  const z = ROW_Z0 + row * ROW_GAP
  const y = 0.06 + row * ROW_RISE
  for (let col = 0; col < PER_SIDE; col++) {
    for (const side of ['L', 'R']) {
      const sign = side === 'L' ? -1 : 1
      const x = sign * (AISLE + col * SEAT_GAP_X)
      const id = `r${row}-${side}${col}`
      SEATS.push({
        id,
        row,
        side,
        col,
        position: [x, y, z],
        label: seatLabel(id),
      })
    }
  }
}

const ID_RE = /^[A-Za-z0-9_-]{11}$/

export function parseYouTube(input) {
  const raw = String(input || '').trim()
  if (!raw) return null
  if (ID_RE.test(raw)) return raw
  try {
    const url = new URL(raw)
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')
    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0] || ''
      return ID_RE.test(id) ? id : null
    }
    if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
      const watch = url.searchParams.get('v')
      if (watch && ID_RE.test(watch)) return watch
      const parts = url.pathname.split('/').filter(Boolean)
      const key = parts.findIndex((part) => ['embed', 'shorts', 'live', 'v'].includes(part))
      const id = key >= 0 ? parts[key + 1] : ''
      return id && ID_RE.test(id) ? id : null
    }
  } catch {
    return null
  }
  return null
}
