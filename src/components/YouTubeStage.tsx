import { useEffect, useRef, useState } from 'react'
import { useRoom } from '../room'
import { playbackSeconds } from '../playback'
import { playerBridge } from '../player-bridge'
import { socket } from '../socket'
import type { PlayerSettings } from '../types'

const DEFAULT_SETTINGS: PlayerSettings = { captions: false, rate: 1, quality: 'auto' }

function applyPlayback(player: YTPlayer, settings: PlayerSettings) {
  try {
    player.setPlaybackRate(settings.rate || 1)
  } catch {
    /* trình phát chưa nhận tốc độ */
  }
  try {
    if (settings.quality && settings.quality !== 'auto') player.setPlaybackQuality(settings.quality)
  } catch {
    /* chất lượng chưa sẵn */
  }
  try {
    if (!settings.captions) {
      player.unloadModule('captions')
      return
    }
    player.loadModule('captions')
    const list = player.getOption('captions', 'tracklist')
    if (!Array.isArray(list) || list.length === 0) return
    const tracks = list as { languageCode?: string }[]
    const vi = tracks.find((item) => String(item.languageCode || '').toLowerCase().startsWith('vi'))
    player.setOption('captions', 'track', vi || tracks[0])
  } catch {
    /* phụ đề chưa tải */
  }
}

function mulberry32(seed: number) {
  let value = seed
  return () => {
    value |= 0
    value = (value + 0x6d2b79f5) | 0
    let t = Math.imul(value ^ (value >>> 15), 1 | value)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    canvas.width = 1280
    canvas.height = 720
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rand = mulberry32(42)
    for (let i = 0; i < 240; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${0.25 + rand() * 0.75})`
      ctx.beginPath()
      ctx.arc(rand() * 1280, rand() * 720, rand() * 1.6, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [])
  return <canvas ref={ref} className="stars" />
}

export function YouTubeStage() {
  const { room, selfId } = useRoom()
  const wrapRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const wantSound = useRef(false)
  const isHostRef = useRef(false)
  const [apiReady, setApiReady] = useState(false)
  const [ready, setReady] = useState(false)
  const [apiError, setApiError] = useState(false)
  const [embedError, setEmbedError] = useState('')
  const [muted, setMuted] = useState(true)

  const track = room?.queue[room.currentIndex]
  const videoId = track?.videoId ?? null
  const token = room?.player.token ?? ''
  const settings = room?.player.settings ?? DEFAULT_SETTINGS
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const isHost = Boolean(room && room.hostId === selfId)
  isHostRef.current = isHost

  useEffect(() => {
    playerBridge.play = () => playerRef.current?.playVideo()
    playerBridge.pause = () => playerRef.current?.pauseVideo()
    playerBridge.currentTime = () => {
      try {
        return playerRef.current?.getCurrentTime() ?? null
      } catch {
        return null
      }
    }
    playerBridge.duration = () => {
      try {
        const value = playerRef.current?.getDuration() ?? 0
        return value > 0 ? value : null
      } catch {
        return null
      }
    }
    playerBridge.seek = (seconds: number) => {
      try {
        playerRef.current?.seekTo(Math.max(0, seconds), true)
      } catch {
        /* trình phát chưa nhận tua */
      }
    }
    playerBridge.isMuted = () => {
      try {
        return playerRef.current?.isMuted() ?? true
      } catch {
        return true
      }
    }
    playerBridge.unmute = () => {
      const player = playerRef.current
      if (!player) return
      wantSound.current = true
      player.unMute()
      player.setVolume(100)
      player.playVideo()
      setMuted(false)
    }
    playerBridge.mute = () => {
      wantSound.current = false
      playerRef.current?.mute()
      setMuted(true)
    }
  })

  useEffect(() => {
    if (window.YT?.Player) {
      setApiReady(true)
      return
    }
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      setApiReady(true)
    }
    if (!document.getElementById('yt-iframe-api')) {
      const script = document.createElement('script')
      script.id = 'yt-iframe-api'
      script.src = 'https://www.youtube.com/iframe_api'
      script.onerror = () => setApiError(true)
      document.body.appendChild(script)
    }
    const timer = window.setTimeout(() => {
      if (!window.YT?.Player) setApiError(true)
    }, 8000)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!apiReady || !wrapRef.current || playerRef.current || !window.YT) return
    const mount = document.createElement('div')
    wrapRef.current.appendChild(mount)
    const player = new window.YT.Player(mount, {
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1,
        controls: 0,
        modestbranding: 1,
        rel: 0,
        fs: 0,
        disablekb: 1,
        iv_load_policy: 3,
        cc_load_policy: 0,
        playsinline: 1,
        mute: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: (event) => {
          event.target.mute()
          const frame = wrapRef.current?.querySelector('iframe')
          frame?.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture')
          setReady(true)
        },
        onStateChange: (event) => {
          if (event.data === 1) {
            setMuted(event.target.isMuted())
            applyPlayback(event.target, settingsRef.current)
          }
          if (isHostRef.current && event.data === 0) socket.emit('queue:next')
        },
        onError: () => {
          setEmbedError('Video này không cho phép chiếu nhúng. Hãy chọn bài khác.')
        },
      },
    })
    playerRef.current = player
    return () => {
      setReady(false)
      playerRef.current = null
      player.destroy()
    }
  }, [apiReady])

  useEffect(() => {
    const player = playerRef.current
    if (!ready || !player || !videoId || !room) return
    setEmbedError('')
    const start = Math.max(0, playbackSeconds(room.player))
    const status = room.player.status
    player.mute()
    if (!wantSound.current) setMuted(true)
    player.loadVideoById({ videoId, startSeconds: start })
    const timer = window.setTimeout(() => {
      const current = playerRef.current
      if (!current) return
      if (wantSound.current) {
        current.unMute()
        current.setVolume(100)
        setMuted(false)
      }
      if (status === 'playing') current.playVideo()
      else current.pauseVideo()
      applyPlayback(current, settingsRef.current)
    }, 450)
    return () => window.clearTimeout(timer)
  }, [ready, videoId, token])

  useEffect(() => {
    const player = playerRef.current
    if (!ready || !player || !videoId) return
    applyPlayback(player, settingsRef.current)
  }, [ready, videoId, settings.captions, settings.rate, settings.quality])

  useEffect(() => {
    if (!ready || isHost || !room || !videoId || room.player.status === 'idle') return
    const player = playerRef.current
    if (!player) return
    const expected = playbackSeconds(room.player)
    try {
      const state = player.getPlayerState()
      if (room.player.status === 'paused') {
        if (state === 1) player.pauseVideo()
        if (Math.abs(player.getCurrentTime() - expected) > 0.8) player.seekTo(expected, true)
        return
      }
      if (state !== 1 && state !== 3) player.playVideo()
      if (Math.abs(player.getCurrentTime() - expected) > 0.45) player.seekTo(expected, true)
    } catch {
      /* player chưa sẵn sàng */
    }
  }, [ready, isHost, room, videoId, room?.player.status, room?.player.updatedAt])

  useEffect(() => {
    if (!isHost || !ready || !videoId) return
    const timer = window.setInterval(() => {
      const player = playerRef.current
      if (!player) return
      try {
        const state = player.getPlayerState()
        if (state !== 1 && state !== 2) return
        socket.emit('player:sync', {
          time: player.getCurrentTime(),
          status: state === 1 ? 'playing' : 'paused',
        })
      } catch {
        /* bỏ qua nhịp này */
      }
    }, 3000)
    return () => window.clearInterval(timer)
  }, [isHost, ready, videoId])

  useEffect(() => {
    if (!videoId) playerRef.current?.pauseVideo()
  }, [videoId])

  return (
    <div className="screen-stage">
      {videoId && (
        <img className="poster" alt="" src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`} />
      )}
      <div ref={wrapRef} className="yt-host" style={{ visibility: videoId ? 'visible' : 'hidden' }} />
      {!videoId && (
        <div className="idle">
          <Starfield />
          <div className="idle-copy">
            <p>BARSHOW CINÉ</p>
            <h2>{room ? 'Màn hình đang chờ' : 'Rạp đã bật đèn'}</h2>
            <span>
              {room
                ? isHost
                  ? 'Tìm video ở bảng Video, bấm một bài để cả phòng cùng xem'
                  : 'Chủ phòng sẽ chọn nhạc hoặc video'
                : 'Tạo phòng để bắt đầu buổi chiếu'}
            </span>
          </div>
        </div>
      )}
      {(embedError || apiError) && (
        <div className="embed-error">{embedError || 'Không tải được trình phát YouTube.'}</div>
      )}
      <span className="sr-only">{muted ? 'Đang tắt tiếng' : 'Đang bật tiếng'}</span>
    </div>
  )
}
