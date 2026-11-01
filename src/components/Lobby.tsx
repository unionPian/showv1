import { useEffect, useState } from 'react'
import { useRoom } from '../room'

export function Lobby() {
  const { online, pending, waiting, error, createRoom, joinRoom, cancelJoin } = useRoom()
  const [name, setName] = useState(() => localStorage.getItem('barshow-name') || '')
  const [code, setCode] = useState('')

  useEffect(() => {
    const saved = sessionStorage.getItem('barshow-code')
    if (saved) setCode(saved)
  }, [])

  function remember() {
    const next = name.trim()
    if (next) localStorage.setItem('barshow-name', next)
    return next
  }

  if (waiting) {
    return (
      <div className="lobby">
        <div className="lobby-card">
          <div className="brand">
            <div className="brand-mark" aria-hidden>
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor" />
              </svg>
            </div>
            <div>
              <strong>barshow ciné</strong>
              <small>PHÒNG {waiting.code}</small>
            </div>
          </div>
          <h1>Đang chờ chủ phòng chấp nhận</h1>
          <p className="lede">Bạn chưa vào rạp. Chủ phòng sẽ thấy thông báo và bấm chấp nhận thì bạn mới được ngồi.</p>
          <button className="btn" type="button" onClick={cancelJoin}>Hủy yêu cầu</button>
          {error && <p className="form-error">{error}</p>}
        </div>
      </div>
    )
  }

  return (
    <div className="lobby">
      <form
        className="lobby-card"
        onSubmit={(event) => {
          event.preventDefault()
          const next = remember()
          if (next.length < 2) return
          if (code.trim()) {
            sessionStorage.setItem('barshow-code', code.trim().toUpperCase())
            joinRoom(next, code)
          } else {
            createRoom(next)
          }
        }}
      >
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor" />
            </svg>
          </div>
          <div>
            <strong>barshow ciné</strong>
            <small>PHÒNG CHIẾU CHUNG</small>
          </div>
        </div>
        <h1>Ngồi cùng nhau, xem một màn hình.</h1>
        <p className="lede">
          Tạo phòng, tìm video rồi bấm để chiếu. Người khác nhập mã và chỉ vào được khi bạn chấp nhận.
        </p>
        <label className="field">
          <span>Tên của bạn</span>
          <input
            value={name}
            maxLength={16}
            placeholder="Ví dụ: Hà"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Mã phòng</span>
          <input
            value={code}
            maxLength={6}
            placeholder="Bỏ trống nếu bạn là chủ phòng"
            spellCheck={false}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
        </label>
        <div className="lobby-actions">
          <button className="btn primary" type="submit" disabled={!online || pending || name.trim().length < 2}>
            {pending ? 'Đang vào...' : code.trim() ? 'Vào phòng' : 'Tạo phòng chiếu'}
          </button>
        </div>
        <p className="hint">
          {online ? 'Người vào phòng phải được chủ phòng chấp nhận.' : 'Đang nối máy chủ phòng...'}
        </p>
        {error && <p className="form-error">{error}</p>}
      </form>
    </div>
  )
}
