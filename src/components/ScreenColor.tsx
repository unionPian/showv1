import { useEffect, useRef } from 'react'
import { playbackSeconds } from '../playback'
import { playerBridge } from '../player-bridge'
import { useRoom } from '../room'
import { IDLE_PALETTE, setScreenPalette } from '../screen-palette'
import type { ScreenTone } from '../screen-palette'

type Rgb = { r: number; g: number; b: number }
type Regions = Record<ScreenTone, Rgb>

const images = new Map<string, Promise<HTMLImageElement>>()
const frames = new Map<string, Promise<Regions[]>>()

function loadImage(src: string) {
  const cached = images.get(src)
  if (cached) return cached
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => {
      images.delete(src)
      reject(new Error('image'))
    }
    image.src = src
  })
  images.set(src, pending)
  return pending
}

function hueOf(r: number, g: number, b: number) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0) return 0
  if (max === r) return ((g - b) / delta + (g < b ? 6 : 0)) / 6
  if (max === g) return ((b - r) / delta + 2) / 6
  return ((r - g) / delta + 4) / 6
}

function fromHue(p: number, q: number, tone: number) {
  let t = tone
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

function punch(rgb: Rgb) {
  const max = Math.max(rgb.r, rgb.g, rgb.b)
  const min = Math.min(rgb.r, rgb.g, rgb.b)
  const light = (max + min) / 2 / 255
  const delta = max - min
  const span = 1 - Math.abs(2 * light - 1)
  const sat = delta === 0 || span === 0 ? 0 : delta / (255 * span)
  const hue = hueOf(rgb.r, rgb.g, rgb.b)
  const nextSat = sat < 0.08 ? 0.16 : Math.min(0.92, Math.max(0.5, sat * 1.35))
  const nextLight = Math.min(0.74, Math.max(0.5, 0.42 + light * 0.42))
  const q = nextLight < 0.5 ? nextLight * (1 + nextSat) : nextLight + nextSat - nextLight * nextSat
  const p = 2 * nextLight - q
  const hex = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255).toString(16).padStart(2, '0')
  return `#${hex(fromHue(p, q, hue + 1 / 3))}${hex(fromHue(p, q, hue))}${hex(fromHue(p, q, hue - 1 / 3))}`
}

function average(data: Uint8ClampedArray, width: number, x0: number, y0: number, x1: number, y1: number): Rgb {
  let r = 0
  let g = 0
  let b = 0
  let count = 0
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = (y * width + x) * 4
      if (data[index + 3] < 20) continue
      r += data[index]
      g += data[index + 1]
      b += data[index + 2]
      count += 1
    }
  }
  if (!count) return { r: 150, g: 170, b: 220 }
  return { r: r / count, g: g / count, b: b / count }
}

function regionsOf(image: HTMLImageElement): Regions {
  const canvas = document.createElement('canvas')
  const width = 48
  const height = 27
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    return {
      left: { r: 93, g: 134, b: 234 },
      right: { r: 180, g: 106, b: 224 },
      center: { r: 142, g: 166, b: 239 },
      top: { r: 111, g: 146, b: 228 },
    }
  }
  ctx.drawImage(image, 0, 0, width, height)
  const data = ctx.getImageData(0, 0, width, height).data
  const third = Math.floor(width / 3)
  return {
    left: average(data, width, 0, 0, third, height),
    right: average(data, width, width - third, 0, width, height),
    center: average(data, width, third, Math.floor(height / 3), width - third, height),
    top: average(data, width, 0, 0, width, Math.floor(height / 3)),
  }
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  }
}

async function sceneFrames(videoId: string) {
  const cached = frames.get(videoId)
  if (cached) return cached
  const pending = (async () => {
    const names = ['hq1.jpg', 'hq2.jpg', 'hq3.jpg', 'hqdefault.jpg']
    const found: Regions[] = []
    for (const name of names) {
      try {
        const image = await loadImage(`https://i.ytimg.com/vi/${videoId}/${name}`)
        if (name !== 'hqdefault.jpg' && image.naturalWidth < 200) continue
        found.push(regionsOf(image))
        if (name === 'hqdefault.jpg') break
        if (found.length === 3) break
      } catch {
        /* khung này không có */
      }
    }
    return found
  })()
  frames.set(videoId, pending)
  return pending
}

function paletteFrom(found: Regions[], fraction: number) {
  if (!found.length) return IDLE_PALETTE
  const scaled = Math.min(0.999, Math.max(0, fraction)) * (found.length - 1)
  const index = Math.floor(scaled)
  const next = found[Math.min(found.length - 1, index + 1)]
  const tone = scaled - index
  const current = found[index]
  return {
    left: punch(mix(current.left, next.left, tone)),
    right: punch(mix(current.right, next.right, tone)),
    center: punch(mix(current.center, next.center, tone)),
    top: punch(mix(current.top, next.top, tone)),
  }
}

export function ScreenColor() {
  const { room } = useRoom()
  const roomRef = useRef(room)
  roomRef.current = room
  const videoId = room?.player.status === 'idle' ? null : room?.queue[room.currentIndex]?.videoId ?? null
  const glow = room?.screenGlow !== false

  useEffect(() => {
    if (!glow || !videoId) {
      setScreenPalette(IDLE_PALETTE)
      return
    }
    let alive = true
    const run = async () => {
      const player = roomRef.current?.player
      if (!player) return
      try {
        const found = await sceneFrames(videoId)
        if (!alive) return
        const duration = playerBridge.duration() || player.duration || 0
        const time = playbackSeconds(player)
        const fraction = duration > 0 ? time / duration : 0
        setScreenPalette(paletteFrom(found, fraction))
      } catch {
        /* giữ màu vừa có */
      }
    }
    void run()
    const timer = window.setInterval(() => void run(), 1200)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [glow, videoId])

  return null
}
