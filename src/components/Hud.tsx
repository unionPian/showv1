import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { LOOK, ROOM_THEME, ROWS, SEATS, TOTAL_SEATS, VIEWPOINTS, seatLabel } from '@shared/cinema.js'
import { useRoom } from '../room'
import { socket } from '../socket'
import { formatTime, playbackSeconds } from '../playback'
import { playerBridge } from '../player-bridge'
import { cameraView, setCameraView } from '../camera-view'
import type { ViewId } from '../camera-view'
import { SeatStudio } from './SeatStudio'
import type { PlayerSettings } from '../types'

const REACTIONS = ['🔥', '👏', '😂', '❤️', '🎬', '✨'] as const
const LETTERS = 'ABCDEFGHIJ'
const SUGGESTIONS = ['nonstop 2026 tiktok', 'Phim Ma', 'Độ mixi', 'Lofi', 'Hài']
const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const STYLE_LABEL: Record<string, string> = {
  short: 'Ngắn',
  long: 'Dài',
  bun: 'Búi',
  cap: 'Mũ',
}
const QUALITIES: [string, string][] = [
  ['auto', 'Tự động'],
  ['hd1080', '1080p'],
  ['hd720', '720p'],
  ['large', '480p'],
  ['medium', '360p'],
  ['small', '240p'],
]

type VideoHit = { videoId: string; title: string; author: string; length: string }

function IconPaint() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M4 16.5V20h3.5L18 9.5 14.5 6 4 16.5z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M13.2 7.3l3.5 3.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}

function IconVideo() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <rect x="3" y="6" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M15 10.5l6-3v9l-6-3v-3z" fill="currentColor" />
    </svg>
  )
}
function IconSeats() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M6 15V8.5A2.5 2.5 0 0 1 8.5 6h7A2.5 2.5 0 0 1 18 8.5V15" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 14h14v2.5A2.5 2.5 0 0 1 16.5 19h-9A2.5 2.5 0 0 1 5 16.5V14z" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}
function IconChat() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v7A2.5 2.5 0 0 1 16.5 16H9l-4 3.5V6.5z" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}
function IconLook() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M8 7.5 12 4l4 3.5V20H8V7.5z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M12 4v16" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}
function IconLight() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path d="M12 3v2.2M5.6 5.6l1.6 1.6M18.4 5.6l-1.6 1.6M4 12h2.2M17.8 12H20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9 14a3 3 0 1 1 6 0c0 1.4-.8 2.2-1.2 3H10.2C9.8 16.2 9 15.4 9 14z" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M10 19h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function Hud() {
  const { room, selfId, error, flash, leaveRoom } = useRoom()
  const [panel, setPanel] = useState<'video' | 'seats' | 'chat' | 'look' | 'lights' | 'theme' | null>('seats')
  const [shot, setShot] = useState({ id: cameraView.id, zoom: cameraView.zoom })
  const [formError, setFormError] = useState('')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [seen, setSeen] = useState(room?.messages.length ?? 0)
  const [pops, setPops] = useState<{ id: string; emoji: string; x: number }[]>([])
  const [chatPops, setChatPops] = useState<{ id: string; name: string; text: string; color?: string; bottom: number }[]>([])
  const [scrub, setScrub] = useState<number | null>(null)
  const chatTimers = useRef<number[]>([])
  const themeTimer = useRef<number | null>(null)
  const themeDraftRef = useRef<Partial<typeof ROOM_THEME>>({})
  const [themeDraft, setThemeDraft] = useState<Partial<typeof ROOM_THEME>>({})

  function paintTheme(key: keyof typeof ROOM_THEME, value: string) {
    themeDraftRef.current = { ...themeDraftRef.current, [key]: value }
    setThemeDraft(themeDraftRef.current)
    if (themeTimer.current) window.clearTimeout(themeTimer.current)
    const pending = themeDraftRef.current
    themeTimer.current = window.setTimeout(() => {
      socket.emit('theme:set', pending)
    }, 90)
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const sync = () => setShot({ id: cameraView.id, zoom: cameraView.zoom })
    window.addEventListener('barshow-camera', sync)
    return () => window.removeEventListener('barshow-camera', sync)
  }, [])

  useEffect(() => {
    if (panel === 'chat' && room) setSeen(room.messages.length)
  }, [panel, room])

  useEffect(() => {
    const onChat = (item: { id: string; name: string; text: string; color?: string }) => {
      setChatPops((current) => [...current, {
        id: item.id,
        name: item.name,
        text: item.text,
        color: item.color,
        bottom: (current.length % 3) * 56,
      }].slice(-6))
      const timer = window.setTimeout(() => {
        setChatPops((current) => current.filter((entry) => entry.id !== item.id))
      }, 5200)
      chatTimers.current.push(timer)
    }
    socket.on('chat:live', onChat)
    return () => {
      socket.off('chat:live', onChat)
    }
  }, [])

  useEffect(() => () => {
    chatTimers.current.forEach((timer) => window.clearTimeout(timer))
  }, [])

  useEffect(() => {
    const onReaction = (item: { id: string; emoji: string }) => {
      const pop = { ...item, x: 2 + Math.random() * 18 }
      setPops((current) => [...current.slice(-10), pop])
      window.setTimeout(() => {
        setPops((current) => current.filter((entry) => entry.id !== item.id))
      }, 2400)
    }
    socket.on('reaction', onReaction)
    return () => {
      socket.off('reaction', onReaction)
    }
  }, [])

  const me = room?.users.find((user) => user.id === selfId)
  const host = room?.users.find((user) => user.id === room.hostId)
  const isHost = Boolean(room && selfId && room.hostId === selfId)
  const track = room && room.player.status !== 'idle' ? room.queue[room.currentIndex] : undefined
  const seated = room?.users.filter((user) => user.seatId).length ?? 0
  const mySeat = me?.seatId ? seatLabel(me.seatId) : null
  const live = isHost ? playerBridge.currentTime() : null
  const shown = room ? (live == null ? playbackSeconds(room.player, now) : live) : 0
  const duration = playerBridge.duration() ?? 0
  const slider = scrub ?? shown
  const muted = playerBridge.isMuted()
  const unread = room && panel !== 'chat' ? Math.max(0, room.messages.length - seen) : 0
  const owners = useMemo(() => {
    const map = new Map<string, { name: string; mine: boolean; color?: string }>()
    room?.users.forEach((user) => {
      if (user.seatId) map.set(user.seatId, { name: user.name, mine: user.id === selfId, color: user.seatFace?.color })
    })
    return map
  }, [room, selfId])

  if (!room) return null

  function togglePanel(next: 'video' | 'seats' | 'chat' | 'look' | 'lights' | 'theme') {
    setPanel((current) => (current === next ? null : next))
  }

  function chooseVideo(hit: VideoHit) {
    setFormError('')
    setAdding(true)
    socket.emit('queue:add', hit, (res: { ok: boolean; error?: string }) => {
      setAdding(false)
      if (!res?.ok) setFormError(res?.error || 'Không thêm được bài')
    })
  }

  function setOptions(partial: Partial<PlayerSettings>) {
    if (!room) return
    socket.emit('player:options', { ...room.player.settings, ...partial })
  }

  function togglePlay() {
    const time = playerBridge.currentTime() ?? playbackSeconds(room!.player)
    if (room!.player.status === 'playing') {
      playerBridge.pause()
      socket.emit('player:set', { status: 'paused', time })
    } else {
      playerBridge.play()
      socket.emit('player:set', { status: 'playing', time })
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room!.code)
      flash(`Đã chép mã ${room!.code}`)
    } catch {
      flash(`Mã phòng: ${room!.code}`)
    }
  }

  function commitSeek(time: number) {
    if (!room || !isHost || room.player.status === 'idle') return
    const next = Math.max(0, duration > 0 ? Math.min(time, duration) : time)
    playerBridge.seek(next)
    socket.emit('player:set', {
      status: room.player.status === 'paused' ? 'paused' : 'playing',
      time: next,
    })
    setScrub(null)
  }

  function wear(partial: { color?: string; hair?: string; pants?: string; skin?: string; style?: string }) {
    if (!me) return
    socket.emit('look:set', {
      color: me.color,
      hair: me.hair,
      pants: me.pants,
      skin: me.skin,
      style: me.style,
      ...partial,
    })
  }

  function sendChat(event: FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text) return
    socket.emit('chat:send', text)
    setDraft('')
    setPanel('chat')
  }

  const playing = room.player.status === 'playing'

  return (
    <div className="hud">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <svg viewBox="0 0 24 24" width="15" height="15">
              <path d="M8 5.5v13l11-6.5-11-6.5z" fill="currentColor" />
            </svg>
          </div>
          <div>
            <strong>barshow ciné</strong>
            <small>PHÒNG CHIẾU CHUNG / {room.code}</small>
          </div>
        </div>
        <div className="center-pill">
          <span className={playing ? 'live-dot' : 'live-dot idle'} />
          <span>{playing ? 'Đang chiếu' : track ? 'Tạm dừng' : 'Đang chờ'}</span>
          <span className="sep" />
          <span>{seated} / {TOTAL_SEATS} ghế</span>
          {mySeat && (
            <>
              <span className="sep" />
              <span>Ghế {mySeat}</span>
            </>
          )}
        </div>
        <div className="top-actions">
          <button className="code-pill" type="button" onClick={copyCode}>
            Mã {room.code}
          </button>
          <button className="text-btn" type="button" onClick={leaveRoom}>Rời phòng</button>
          <div className="me-badge" style={{ background: me?.color || '#d7c4a3' }} title={me?.name}>
            {(me?.name || 'B').slice(0, 1).toUpperCase()}
          </div>
        </div>
      </header>

      {error && <div className="toast">{error}</div>}
      {!mySeat && room.requests.length === 0 && (
        <button className="seat-banner" type="button" onClick={() => setPanel('seats')}>
          Chọn chỗ ngồi trong rạp
        </button>
      )}
      {isHost && room.requests.length > 0 && (
        <div className="admit" role="dialog" aria-label="Yêu cầu vào phòng">
          <p className="kicker">Có người muốn vào</p>
          {room.requests.map((request) => (
            <div className="admit-row" key={request.id}>
              <strong>{request.name}</strong>
              <div>
                <button type="button" onClick={() => socket.emit('join:decide', { id: request.id, accept: false })}>Từ chối</button>
                <button type="button" className="yes" onClick={() => socket.emit('join:decide', { id: request.id, accept: true })}>Chấp nhận</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="now">
        <p className="kicker">Trên màn ảnh</p>
        <h2>{track ? track.title : 'Chưa có video'}</h2>
        {track && duration > 0 && (
          <label className="seek">
            <span>{formatTime(slider)}</span>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.1}
              value={Math.min(Math.max(slider, 0), duration)}
              disabled={!isHost}
              style={{ ['--p' as string]: `${(Math.min(Math.max(slider, 0), duration) / duration) * 100}%` }}
              aria-label="Tua video"
              onPointerDown={(event) => {
                if (!isHost) return
                event.currentTarget.setPointerCapture(event.pointerId)
                setScrub(shown)
              }}
              onInput={(event) => {
                if (!isHost) return
                const next = Number(event.currentTarget.value)
                setScrub(next)
                playerBridge.seek(next)
              }}
              onPointerUp={(event) => {
                if (!isHost) return
                commitSeek(Number(event.currentTarget.value))
              }}
              onPointerCancel={() => setScrub(null)}
              onKeyUp={(event) => {
                if (!isHost) return
                if (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End') {
                  commitSeek(Number(event.currentTarget.value))
                }
              }}
            />
            <span>{formatTime(duration)}</span>
          </label>
        )}
        <p className="now-meta">
          {host ? `Chủ phòng · ${host.name}` : 'Chủ phòng'}
          {track && duration <= 0 ? ` · ${formatTime(shown)}` : ''}
        </p>
        {isHost && !track && (
          <div className="now-actions">
            <button className="btn small" type="button" onClick={() => setPanel('video')}>
              Chọn video
            </button>
          </div>
        )}
        {isHost && track && (
          <div className="now-actions">
            <button className="btn small" type="button" onClick={togglePlay}>
              {playing ? 'Tạm dừng' : 'Tiếp tục'}
            </button>
            <button
              className="btn small"
              type="button"
              disabled={room.currentIndex >= room.queue.length - 1}
              onClick={() => socket.emit('queue:next')}
            >
              Chuyển bài tiếp theo
            </button>
          </div>
        )}
      </section>

      <aside className="rail">
        <button className={panel === 'video' ? 'active' : ''} type="button" onClick={() => togglePanel('video')}>
          <IconVideo />
          Video
          {room.queue.length > 0 && <em>{room.queue.length}</em>}
        </button>
        <button className={panel === 'seats' ? 'active' : ''} type="button" onClick={() => togglePanel('seats')}>
          <IconSeats />
          Hàng ghế
        </button>
        <button className={panel === 'look' ? 'active' : ''} type="button" onClick={() => togglePanel('look')}>
          <IconLook />
          Tủ đồ
        </button>
        <button className={panel === 'chat' ? 'active' : ''} type="button" onClick={() => togglePanel('chat')}>
          <IconChat />
          Trò chuyện
          {unread > 0 && <em>{unread}</em>}
        </button>
        <button
          className={panel === 'lights' || room.lasers || room.screenGlow || room.ceiling ? 'active' : ''}
          type="button"
          onClick={() => togglePanel('lights')}
        >
          <IconLight />
          Chiếu sáng
        </button>
        <button className={panel === 'theme' ? 'active' : ''} type="button" onClick={() => togglePanel('theme')}>
          <IconPaint />
          Màu rạp
        </button>
      </aside>

      {panel && (
        <section className="drawer" aria-label={panel}>
          {panel === 'video' && (
            <>
              <h3>Chọn video</h3>
              <VideoSettings
                settings={room.player.settings}
                isHost={isHost}
                onChange={setOptions}
              />
              {isHost ? (
                <VideoSearch disabled={adding} error={formError} onPick={chooseVideo} />
              ) : (
                <p className="empty-note">Chỉ chủ phòng được chọn bài chiếu. Bạn vẫn xem cùng một màn hình.</p>
              )}
              <ul className="queue">
                {room.queue.length === 0 && <li className="empty-note">Hàng chờ đang trống.</li>}
                {room.queue.map((item, index) => (
                  <li key={item.id} className={index === room.currentIndex && room.player.status !== 'idle' ? 'active' : ''}>
                    <img src={`https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`} alt="" />
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.author || 'YouTube'}</span>
                    </div>
                    {isHost && (
                      <div className="queue-actions">
                        <button type="button" onClick={() => socket.emit('queue:play', index)}>Chiếu</button>
                        <button type="button" onClick={() => socket.emit('queue:remove', index)}>Xóa</button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {panel === 'seats' && (
            <>
              {me?.seatId && <SeatStudio label={seatLabel(me.seatId)} face={me.seatFace} />}
              <h3>Chọn ghế</h3>
              <p className="empty-note">
                {me?.seatId
                  ? 'Bấm ghế trống để đổi chỗ. Bấm lại ghế của bạn để đứng dậy.'
                  : 'Ngồi vào một ghế để vẽ, chọn màu và ghi chữ lên mặt lưng.'}
              </p>
              <div className="map-screen">Màn hình</div>
              <div className="seat-map">
                {Array.from({ length: ROWS }, (_, row) => {
                  const left = SEATS.filter((seat) => seat.row === row && seat.side === 'L').sort((a, b) => b.col - a.col)
                  const right = SEATS.filter((seat) => seat.row === row && seat.side === 'R').sort((a, b) => a.col - b.col)
                  return (
                    <div className="seat-row" key={row}>
                      <span>{LETTERS[row]}</span>
                      {left.map((seat) => {
                        const owner = owners.get(seat.id)
                        const cls = owner?.mine ? 'mine' : owner ? 'taken' : ''
                        return (
                          <button
                            key={seat.id}
                            type="button"
                            className={cls}
                            style={owner?.color ? { background: owner.color } : undefined}
                            title={owner ? `${seat.label} · ${owner.name}` : `${seat.label} · trống`}
                            onClick={() => socket.emit('seat:claim', seat.id, (res: { ok: boolean; error?: string }) => {
                              if (!res?.ok && res?.error) flash(res.error)
                            })}
                          />
                        )
                      })}
                      <i />
                      {right.map((seat) => {
                        const owner = owners.get(seat.id)
                        const cls = owner?.mine ? 'mine' : owner ? 'taken' : ''
                        return (
                          <button
                            key={seat.id}
                            type="button"
                            className={cls}
                            style={owner?.color ? { background: owner.color } : undefined}
                            title={owner ? `${seat.label} · ${owner.name}` : `${seat.label} · trống`}
                            onClick={() => socket.emit('seat:claim', seat.id, (res: { ok: boolean; error?: string }) => {
                              if (!res?.ok && res?.error) flash(res.error)
                            })}
                          />
                        )
                      })}
                    </div>
                  )
                })}
              </div>
              <div className="legend">
                <span><b className="free" /> Trống</span>
                <span><b className="mine" /> Của bạn</span>
                <span><b className="taken" /> Có người</span>
              </div>
              <ul className="members">
                {room.users.map((user) => (
                  <li key={user.id}>
                    <i style={{ background: user.color }} />
                    <span>{user.name}</span>
                    <em>{user.id === room.hostId ? 'Chủ phòng' : user.seatId ? `Ghế ${seatLabel(user.seatId)}` : 'Chưa ngồi'}</em>
                  </li>
                ))}
              </ul>
            </>
          )}

          {panel === 'look' && me && (
            <>
              <h3>Tủ đồ</h3>
              <p className="empty-note">Đổi áo, tóc, quần và da. Cả phòng nhìn thấy nhân vật của bạn khi bạn ngồi.</p>
              <LookRow label="Áo" colors={LOOK.shirts} value={me.color} onPick={(color) => wear({ color })} />
              <LookRow label="Tóc" colors={LOOK.hair} value={me.hair} onPick={(hair) => wear({ hair })} />
              <LookRow label="Quần" colors={LOOK.pants} value={me.pants || LOOK.pants[0]} onPick={(pants) => wear({ pants })} />
              <LookRow label="Da" colors={LOOK.skin} value={me.skin || LOOK.skin[0]} onPick={(skin) => wear({ skin })} />
              <div className="look-block">
                <span>Kiểu tóc</span>
                <div className="style-picks">
                  {LOOK.styles.map((style) => (
                    <button
                      key={style}
                      type="button"
                      className={(me.style || 'short') === style ? 'on' : ''}
                      onClick={() => wear({ style })}
                    >
                      {STYLE_LABEL[style] || style}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {panel === 'lights' && (
            <>
              <h3>Chiếu sáng</h3>
              <p className="empty-note">Cả phòng dùng chung. Đèn trần, tia màu và ánh sáng màn hình bật riêng.</p>
              <div className="light-row">
                <div>
                  <strong>Đèn trần</strong>
                  <span>Bật sáng cả rạp</span>
                </div>
                <button
                  className={room.ceiling ? 'switch on' : 'switch'}
                  type="button"
                  aria-label="Đèn trần"
                  aria-pressed={Boolean(room.ceiling)}
                  onClick={() => socket.emit('lights:set', { ceiling: !room.ceiling })}
                >
                  <i />
                </button>
              </div>
              <div className="light-row">
                <div>
                  <strong>Đèn sáng</strong>
                  <span>Tia sáng màu trên trần rạp</span>
                </div>
                <button
                  className={room.lasers ? 'switch on' : 'switch'}
                  type="button"
                  aria-label="Đèn sáng"
                  aria-pressed={room.lasers}
                  onClick={() => socket.emit('lights:set', { lasers: !room.lasers })}
                >
                  <i />
                </button>
              </div>
              <div className="light-row">
                <div>
                  <strong>Màn hình ánh sáng</strong>
                  <span>Ánh sáng loang từ màn hình ra phía ghế</span>
                </div>
                <button
                  className={room.screenGlow ? 'switch on' : 'switch'}
                  type="button"
                  aria-label="Màn hình ánh sáng"
                  aria-pressed={Boolean(room.screenGlow)}
                  onClick={() => socket.emit('lights:set', { screenGlow: !room.screenGlow })}
                >
                  <i />
                </button>
              </div>
            </>
          )}

          {panel === 'theme' && (
            <>
              <h3>Màu rạp</h3>
              <p className="empty-note">
                {isHost ? 'Cả phòng nhìn cùng một màu. Ghế đã vẽ vẫn giữ hình trên mặt lưng.' : 'Chỉ chủ phòng được đổi màu rạp.'}
              </p>
              {(
                [
                  ['walls', 'Bốn bức tường'],
                  ['wallLight', 'Đèn tường'],
                  ['stage', 'Bệ sân khấu'],
                  ['speaker', 'Loa'],
                  ['frame', 'Khung tivi'],
                  ['seats', 'Tất cả ghế'],
                ] as const
              ).map(([key, label]) => (
                <label className="theme-row" key={key}>
                  <span>{label}</span>
                  <input
                    type="color"
                    value={themeDraft[key] || room.theme?.[key] || ROOM_THEME[key]}
                    disabled={!isHost}
                    onChange={(event) => paintTheme(key, event.target.value)}
                  />
                </label>
              ))}
            </>
          )}

          {panel === 'chat' && (
            <>
              <h3>Trò chuyện</h3>
              <div className="chat-log">
                {room.messages.map((message) => (
                  <p key={message.id} className={message.system ? 'system' : ''}>
                    {message.system ? message.text : (
                      <>
                        <b style={{ color: message.color || '#e6d3ad' }}>{message.name}</b>
                        <span>{message.text}</span>
                      </>
                    )}
                  </p>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      <div className="view-dock">
        <button
          className="zoom"
          type="button"
          aria-label="Phóng to"
          onClick={() => setCameraView({ zoom: cameraView.zoom - 0.1 })}
        >
          +
        </button>
        {VIEWPOINTS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={shot.id === item.id ? 'on' : ''}
            onClick={() => setCameraView({ id: item.id as ViewId })}
          >
            {item.label}
          </button>
        ))}
        <button
          className="zoom"
          type="button"
          aria-label="Thu nhỏ"
          onClick={() => setCameraView({ zoom: cameraView.zoom + 0.1 })}
        >
          −
        </button>
      </div>

      <div className="chat-lane" aria-live="polite">
        {chatPops.map((pop) => (
          <p key={pop.id} className="chat-pop" style={{ bottom: pop.bottom }}>
            <b style={{ color: pop.color || '#e6d3ad' }}>{pop.name}</b>
            <span>{pop.text}</span>
          </p>
        ))}
      </div>
      <div className="float-layer">
        {pops.map((pop) => (
          <span key={pop.id} className="pop" style={{ left: pop.x }}>{pop.emoji}</span>
        ))}
      </div>
      <div className="react-dock">
        {REACTIONS.map((emoji) => (
          <button key={emoji} type="button" onClick={() => socket.emit('reaction', emoji)}>{emoji}</button>
        ))}
      </div>

      <form className="composer" onSubmit={sendChat}>
        <input
          value={draft}
          maxLength={200}
          placeholder="Nói gì với cả rạp đi..."
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" aria-label="Gửi">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path d="M4 12h12M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>

      {track && muted && (
        <button className="unmute-fab" type="button" onClick={() => playerBridge.unmute()}>
          Bật tiếng để xem cùng phòng
        </button>
      )}
      <button
        className="vol-btn"
        type="button"
        onClick={() => (muted ? playerBridge.unmute() : playerBridge.mute())}
        aria-label={muted ? 'Bật tiếng' : 'Tắt tiếng'}
      >
        {muted ? '🔇' : '🔊'}
      </button>
    </div>
  )
}

function LookRow({
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
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            className={value === color ? 'on' : ''}
            style={{ background: color }}
            aria-label={`${label} ${color}`}
            onClick={() => onPick(color)}
          />
        ))}
      </div>
    </div>
  )
}

function VideoSettings({
  settings,
  isHost,
  onChange,
}: {
  settings: PlayerSettings
  isHost: boolean
  onChange: (partial: Partial<PlayerSettings>) => void
}) {
  return (
    <div className="settings">
      <p className="kicker">Đặt video</p>
      <label className="setting-row">
        <span>Phụ đề</span>
        <button type="button" disabled={!isHost} onClick={() => onChange({ captions: !settings.captions })}>
          {settings.captions ? 'Bật' : 'Tắt'}
        </button>
      </label>
      <label className="setting-row">
        <span>Tốc độ</span>
        <select
          disabled={!isHost}
          value={settings.rate}
          onChange={(event) => onChange({ rate: Number(event.target.value) })}
        >
          {RATES.map((rate) => (
            <option key={rate} value={rate}>{rate === 1 ? 'Chuẩn' : `${rate}x`}</option>
          ))}
        </select>
      </label>
      <label className="setting-row">
        <span>Chất lượng</span>
        <select
          disabled={!isHost}
          value={settings.quality}
          onChange={(event) => onChange({ quality: event.target.value })}
        >
          {QUALITIES.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <p className="empty-note">Phụ đề mặc định tắt. Cả phòng dùng chung cài đặt của chủ phòng.</p>
    </div>
  )
}

function VideoSearch({
  disabled,
  error,
  onPick,
}: {
  disabled: boolean
  error: string
  onPick: (hit: VideoHit) => void
}) {
  const [query, setQuery] = useState(SUGGESTIONS[0])
  const [hits, setHits] = useState<VideoHit[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState('')

  async function search(text: string) {
    const q = text.trim()
    if (q.length < 2) return
    setLoading(true)
    setSearchError('')
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json() as { videos?: VideoHit[]; error?: string }
      setHits(data.videos || [])
      if (!data.videos?.length) setSearchError(data.error || 'Không thấy video phù hợp')
    } catch {
      setSearchError('Không tìm được video')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void search('nonstop 2026 tiktok')
  }, [])

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void search(query)
      }}
    >
      <label className="field">
        <span>Tìm video</span>
        <input
          value={query}
          placeholder="Tên bài, ca sĩ, phim..."
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="chips">
        {SUGGESTIONS.map((item) => (
          <button
            key={item}
            type="button"
            className={query === item ? 'on' : ''}
            onClick={() => {
              setQuery(item)
              void search(item)
            }}
          >
            {item}
          </button>
        ))}
      </div>
      {loading && <p className="empty-note">Đang tìm...</p>}
      {(searchError || error) && <p className="form-error">{searchError || error}</p>}
      <div className="video-grid">
        {hits.map((hit) => (
          <button key={hit.videoId} type="button" className="video-card" disabled={disabled} onClick={() => onPick(hit)}>
            <img src={`https://i.ytimg.com/vi/${hit.videoId}/hqdefault.jpg`} alt="" />
            <strong>{hit.title}</strong>
            <span>{[hit.author, hit.length].filter(Boolean).join(' · ')}</span>
          </button>
        ))}
      </div>
    </form>
  )
}
