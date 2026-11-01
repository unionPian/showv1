import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { SEAT_FACE } from '@shared/cinema.js'
import { socket } from '../socket'
import { paintSeat } from '../seat-face'
import type { SeatFace } from '../types'

const STYLE_LABEL: Record<string, string> = {
  plain: 'Trơn',
  stripe: 'Sọc',
  quilt: 'Chần',
  velvet: 'Nhung',
}
const PAD_W = 168
const PAD_H = 210

export function SeatStudio({ label, face }: { label: string; face?: SeatFace }) {
  const [color, setColor] = useState(face?.color || SEAT_FACE.colors[0])
  const [style, setStyle] = useState(face?.style || 'plain')
  const [ink, setInk] = useState(face?.ink || SEAT_FACE.inks[0])
  const [text, setText] = useState(face?.text || '')
  const [note, setNote] = useState('')
  const viewRef = useRef<HTMLCanvasElement>(null)
  const layerRef = useRef<HTMLCanvasElement | null>(null)
  const sent = useRef<string | null>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const look = useRef({ color, style, ink, text })
  look.current = { color, style, ink, text }

  if (!layerRef.current) {
    const layer = document.createElement('canvas')
    layer.width = PAD_W
    layer.height = PAD_H
    layerRef.current = layer
  }

  function compose() {
    const view = viewRef.current
    const layer = layerRef.current
    if (!view || !layer) return
    paintSeat(view, look.current, layer)
  }

  useEffect(() => {
    compose()
  })

  useEffect(() => {
    const src = face?.drawing || ''
    if (src === sent.current) return
    sent.current = src
    const layer = layerRef.current
    const ctx = layer?.getContext('2d')
    if (!layer || !ctx) return
    ctx.clearRect(0, 0, layer.width, layer.height)
    if (!src) return
    const img = new Image()
    img.onload = () => {
      ctx.drawImage(img, 0, 0, layer.width, layer.height)
      compose()
    }
    img.src = src
  }, [face?.drawing])

  function emit(partial: Partial<SeatFace>) {
    socket.emit('seat:face', partial)
  }

  function publishDrawing() {
    const layer = layerRef.current
    if (!layer) return
    const url = layer.toDataURL('image/png')
    if (url.length > 80000) {
      setNote('Nét vẽ quá dày, hãy xóa bớt rồi vẽ lại.')
      return
    }
    setNote('')
    sent.current = url
    emit({ drawing: url })
  }

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * PAD_W,
      y: ((event.clientY - rect.top) / rect.height) * PAD_H,
    }
  }

  function onDown(event: PointerEvent<HTMLCanvasElement>) {
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      /* một số trình duyệt không giữ được con trỏ */
    }
    drawing.current = true
    last.current = point(event)
  }

  function onMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return
    const next = point(event)
    const ctx = layerRef.current?.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = look.current.ink
    ctx.lineWidth = 5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(last.current.x, last.current.y)
    ctx.lineTo(next.x, next.y)
    ctx.stroke()
    last.current = next
    compose()
  }

  function onUp() {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    publishDrawing()
  }

  function clearDrawing() {
    const layer = layerRef.current
    const ctx = layer?.getContext('2d')
    if (!layer || !ctx) return
    ctx.clearRect(0, 0, layer.width, layer.height)
    compose()
    sent.current = ''
    setNote('')
    emit({ drawing: '' })
  }

  return (
    <div className="seat-studio">
      <h3>Mặt lưng ghế {label}</h3>
      <p className="empty-note">Vẽ, chọn màu, ghi chữ và kiểu ghế. Cả phòng nhìn thấy trên lưng ghế bạn đang ngồi.</p>
      <div className="look-block">
        <span>Kiểu ghế</span>
        <div className="style-picks">
          {SEAT_FACE.styles.map((item) => (
            <button
              key={item}
              type="button"
              className={style === item ? 'on' : ''}
              onClick={() => {
                setStyle(item)
                emit({ style: item })
              }}
            >
              {STYLE_LABEL[item] || item}
            </button>
          ))}
        </div>
      </div>
      <Swatches
        label="Màu ghế"
        colors={SEAT_FACE.colors}
        value={color}
        onPick={(next) => {
          setColor(next)
          emit({ color: next })
        }}
      />
      <label className="seat-text">
        <span>Chữ trên lưng</span>
        <input
          value={text}
          maxLength={16}
          placeholder="Tên hoặc lời nhắn"
          onChange={(event) => {
            const next = event.target.value
            setText(next)
            emit({ text: next })
          }}
        />
      </label>
      <Swatches
        label="Màu mực"
        colors={SEAT_FACE.inks}
        value={ink}
        onPick={(next) => {
          setInk(next)
          emit({ ink: next })
        }}
      />
      <div className="look-block">
        <span>Vẽ lên lưng ghế</span>
        <canvas
          ref={viewRef}
          className="seat-pad"
          width={PAD_W}
          height={PAD_H}
          aria-label="Bảng vẽ lưng ghế"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        <div className="seat-tools">
          <button type="button" onClick={clearDrawing}>Xóa nét</button>
        </div>
        {note && <p className="form-error">{note}</p>}
      </div>
    </div>
  )
}

function Swatches({
  label,
  colors,
  value,
  onPick,
}: {
  label: string
  colors: string[]
  value: string
  onPick: (color: string) => void
}) {
  return (
    <div className="look-block">
      <span>{label}</span>
      <div className="swatches">
        {colors.map((item) => (
          <button
            key={item}
            type="button"
            className={value === item ? 'on' : ''}
            style={{ background: item }}
            aria-label={`${label} ${item}`}
            onClick={() => onPick(item)}
          />
        ))}
      </div>
    </div>
  )
}
