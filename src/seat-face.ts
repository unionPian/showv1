import type { SeatFace } from './types'

export function paintSeat(
  canvas: HTMLCanvasElement,
  face: Pick<SeatFace, 'color' | 'style' | 'text' | 'ink'>,
  drawing: CanvasImageSource | null,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = face.color || '#3e6e67'
  ctx.fillRect(0, 0, w, h)

  if (face.style === 'stripe') {
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    const band = Math.max(4, w / 16)
    for (let x = 0; x < w; x += band * 2.4) ctx.fillRect(x, 0, band, h)
  } else if (face.style === 'quilt') {
    ctx.strokeStyle = 'rgba(255,255,255,0.32)'
    ctx.lineWidth = Math.max(1.5, w / 90)
    const step = w / 4
    for (let y = step / 2; y < h; y += step) {
      for (let x = step / 2; x < w; x += step) {
        ctx.beginPath()
        ctx.moveTo(x, y - step / 2)
        ctx.lineTo(x + step / 2, y)
        ctx.lineTo(x, y + step / 2)
        ctx.lineTo(x - step / 2, y)
        ctx.closePath()
        ctx.stroke()
      }
    }
  } else if (face.style === 'velvet') {
    const glow = ctx.createRadialGradient(w * 0.5, h * 0.28, w * 0.05, w * 0.5, h * 0.35, h * 0.72)
    glow.addColorStop(0, 'rgba(255,255,255,0.32)')
    glow.addColorStop(1, 'rgba(0,0,0,0.34)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, h)
  }

  if (drawing) ctx.drawImage(drawing, 0, 0, w, h)

  const text = face.text.trim()
  if (!text) return
  ctx.save()
  ctx.fillStyle = face.ink || '#f4f1ea'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = Math.max(2, w / 40)
  let size = Math.floor(w / 7.2)
  ctx.font = `700 ${size}px "Segoe UI", sans-serif`
  while (size > 14 && ctx.measureText(text).width > w * 0.88) {
    size -= 1
    ctx.font = `700 ${size}px "Segoe UI", sans-serif`
  }
  ctx.fillText(text, w / 2, h * 0.16)
  ctx.restore()
}
