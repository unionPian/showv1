import type { Player } from './types'

export function absorbRoom<T extends { player: Player }>(room: T): T {
  const skew = Math.max(0, room.player.serverNow - room.player.updatedAt) / 1000
  const time = room.player.status === 'playing' ? room.player.time + skew : room.player.time
  return {
    ...room,
    player: { ...room.player, time, clientAnchor: Date.now() },
  }
}

export function playbackSeconds(player: Player, now = Date.now()) {
  if (player.status !== 'playing') return player.time
  const anchor = player.clientAnchor ?? now
  return player.time + (now - anchor) / 1000
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const whole = Math.floor(seconds)
  const mins = Math.floor(whole / 60)
  const hours = Math.floor(mins / 60)
  const ss = String(whole % 60).padStart(2, '0')
  if (hours > 0) return `${hours}:${String(mins % 60).padStart(2, '0')}:${ss}`
  return `${mins}:${ss}`
}
