import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { socket } from './socket'
import { absorbRoom } from './playback'
import type { RoomState } from './types'

type Ack = { ok: boolean; error?: string; room?: RoomState; selfId?: string; waiting?: boolean }

type RoomContextValue = {
  room: RoomState | null
  selfId: string | null
  online: boolean
  pending: boolean
  waiting: { code: string } | null
  error: string | null
  flash: (message: string) => void
  createRoom: (name: string) => void
  joinRoom: (name: string, code: string) => void
  cancelJoin: () => void
  leaveRoom: () => void
  claimSeat: (seatId: string) => void
}

const RoomContext = createContext<RoomContextValue | null>(null)

export function RoomProvider({ children }: { children: ReactNode }) {
  const [room, setRoom] = useState<RoomState | null>(null)
  const [selfId, setSelfId] = useState<string | null>(null)
  const [online, setOnline] = useState(socket.connected)
  const [pending, setPending] = useState(false)
  const [waiting, setWaiting] = useState<{ code: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const flash = useCallback((message: string) => {
    setError(message)
    window.setTimeout(() => {
      setError((current) => (current === message ? null : current))
    }, 3400)
  }, [])

  useEffect(() => {
    const onConnect = () => setOnline(true)
    const onDisconnect = () => {
      setOnline(false)
      setRoom(null)
      setSelfId(null)
      setWaiting(null)
      setPending(false)
    }
    const onUpdate = (next: RoomState) => setRoom(absorbRoom(next))
    const onAccepted = (res: Ack) => {
      setPending(false)
      setWaiting(null)
      if (!res.room) return
      setSelfId(res.selfId || null)
      setRoom(absorbRoom(res.room))
    }
    const onRejected = (res: { error?: string }) => {
      setPending(false)
      setWaiting(null)
      flash(res?.error || 'Chủ phòng đã từ chối')
    }
    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('room:update', onUpdate)
    socket.on('join:accepted', onAccepted)
    socket.on('join:rejected', onRejected)
    setOnline(socket.connected)
    if (!socket.connected) socket.connect()
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room:update', onUpdate)
      socket.off('join:accepted', onAccepted)
      socket.off('join:rejected', onRejected)
    }
  }, [flash])

  const finish = useCallback((res: Ack, timeout: number) => {
    window.clearTimeout(timeout)
    setPending(false)
    if (!res?.ok || !res.room) {
      flash(res?.error || 'Không thực hiện được')
      return
    }
    setSelfId(res.selfId || null)
    setRoom(absorbRoom(res.room))
  }, [flash])

  const createRoom = useCallback((name: string) => {
    setPending(true)
    const timeout = window.setTimeout(() => {
      setPending(false)
      flash('Máy chủ không phản hồi')
    }, 8000)
    socket.emit('room:create', { name }, (res: Ack) => finish(res, timeout))
  }, [finish, flash])

  const joinRoom = useCallback((name: string, code: string) => {
    setPending(true)
    const timeout = window.setTimeout(() => {
      setPending(false)
      flash('Máy chủ không phản hồi')
    }, 8000)
    socket.emit('room:join', { name, code }, (res: Ack) => {
      window.clearTimeout(timeout)
      setPending(false)
      if (!res?.ok) {
        flash(res?.error || 'Không vào được phòng')
        return
      }
      if (res.waiting) {
        setWaiting({ code: code.trim().toUpperCase() })
        return
      }
      if (!res.room) {
        flash('Không vào được phòng')
        return
      }
      setWaiting(null)
      setSelfId(res.selfId || null)
      setRoom(absorbRoom(res.room))
    })
  }, [flash])

  const cancelJoin = useCallback(() => {
    socket.emit('room:cancel-join')
    setWaiting(null)
    setPending(false)
  }, [])

  const leaveRoom = useCallback(() => {
    socket.emit('room:leave')
    setRoom(null)
    setSelfId(null)
  }, [])

  const claimSeat = useCallback((seatId: string) => {
    socket.emit('seat:claim', seatId, (res: { ok: boolean; error?: string }) => {
      if (!res?.ok && res?.error) flash(res.error)
    })
  }, [flash])

  const value = useMemo(
    () => ({ room, selfId, online, pending, waiting, error, flash, createRoom, joinRoom, cancelJoin, leaveRoom, claimSeat }),
    [room, selfId, online, pending, waiting, error, flash, createRoom, joinRoom, cancelJoin, leaveRoom, claimSeat],
  )

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>
}

export function useRoom() {
  const ctx = useContext(RoomContext)
  if (!ctx) throw new Error('useRoom phải nằm trong RoomProvider')
  return ctx
}
