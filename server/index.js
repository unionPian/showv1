import express from 'express'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import { Server } from 'socket.io'
import { LOOK, SEAT_FACE, TOTAL_SEATS, ROOM_THEME, cleanTheme, isValidSeat, seatLabel } from '../shared/cinema.js'
import { searchYouTube } from './youtube.js'

const PORT = Number(process.env.PORT || 3001)
const rooms = new Map()
function pick(list) {
  return list[Math.floor(Math.random() * list.length)]
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(cors())
app.use(express.static(path.join(__dirname, '../dist')))

const httpServer = http.createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function cleanName(name) {
  const next = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 16)
  return next.length >= 2 ? next : null
}

function appearance() {
  return {
    color: pick(LOOK.shirts),
    hair: pick(LOOK.hair),
    pants: pick(LOOK.pants),
    skin: pick(LOOK.skin),
    style: pick(LOOK.styles),
  }
}

function applySeatFace(user, payload) {
  const prev = user.seatFace || {
    color: SEAT_FACE.colors[0],
    style: 'plain',
    text: '',
    ink: SEAT_FACE.inks[0],
    drawing: '',
  }
  const next = { ...prev }
  if (SEAT_FACE.colors.includes(payload?.color)) next.color = payload.color
  if (SEAT_FACE.styles.includes(payload?.style)) next.style = payload.style
  if (SEAT_FACE.inks.includes(payload?.ink)) next.ink = payload.ink
  if (typeof payload?.text === 'string') {
    next.text = payload.text.replace(/\s+/g, ' ').trim().slice(0, 16)
  }
  if (payload?.drawing === '') next.drawing = ''
  else if (
    typeof payload?.drawing === 'string'
    && payload.drawing.startsWith('data:image/png;base64,')
    && payload.drawing.length <= 80000
  ) {
    next.drawing = payload.drawing
  }
  user.seatFace = next
}

function applyLook(user, payload) {
  if (LOOK.shirts.includes(payload?.color)) user.color = payload.color
  if (LOOK.hair.includes(payload?.hair)) user.hair = payload.hair
  if (LOOK.pants.includes(payload?.pants)) user.pants = payload.pants
  if (LOOK.skin.includes(payload?.skin)) user.skin = payload.skin
  if (LOOK.styles.includes(payload?.style)) user.style = payload.style
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]
const QUALITIES = ['auto', 'small', 'medium', 'large', 'hd720', 'hd1080']

function defaultSettings() {
  return { captions: false, rate: 1, quality: 'auto' }
}

function cleanSettings(input, prev = defaultSettings()) {
  const rate = RATES.includes(Number(input?.rate)) ? Number(input.rate) : prev.rate
  const quality = QUALITIES.includes(input?.quality) ? input.quality : prev.quality
  return {
    captions: Boolean(input?.captions),
    rate,
    quality,
  }
}

function idlePlayer(settings = defaultSettings()) {
  return { status: 'idle', time: 0, updatedAt: Date.now(), token: uid(), duration: 0, settings }
}

function publicRoom(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    lasers: room.lasers,
    screenGlow: room.screenGlow !== false,
    beatLights: room.beatLights !== false,
    ceiling: room.ceiling === true,
    theme: room.theme || ROOM_THEME,
    users: room.users,
    queue: room.queue,
    currentIndex: room.currentIndex,
    player: { ...room.player, serverNow: Date.now() },
    messages: room.messages.slice(-80),
    requests: room.requests.map((item) => ({ id: item.id, name: item.name })),
    totalSeats: TOTAL_SEATS,
  }
}

function pushMessage(room, message) {
  const entry = { id: uid(), at: Date.now(), ...message }
  room.messages.push(entry)
  if (room.messages.length > 80) room.messages.shift()
  return entry
}

function broadcast(room) {
  io.to(room.code).emit('room:update', publicRoom(room))
}

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)]
  return rooms.has(code) ? makeCode() : code
}

function leave(socket) {
  const code = socket.data.code
  if (!code || !rooms.has(code)) return
  const room = rooms.get(code)
  const user = room.users.find((item) => item.id === socket.id)
  room.users = room.users.filter((item) => item.id !== socket.id)
  socket.leave(code)
  socket.data.code = null
  if (room.users.length === 0) {
    rejectAll(room, 'Phòng đã đóng')
    rooms.delete(code)
    return
  }
  if (user) pushMessage(room, { name: 'Rạp', text: `${user.name} rời phòng`, system: true })
  if (room.hostId === socket.id) {
    room.hostId = room.users[0].id
    pushMessage(room, { name: 'Rạp', text: `${room.users[0].name} trở thành chủ phòng`, system: true })
  }
  broadcast(room)
}

function startTrack(room, index) {
  const settings = room.player?.settings || defaultSettings()
  room.currentIndex = index
  room.player = {
    status: 'playing',
    time: 0,
    updatedAt: Date.now(),
    token: uid(),
    duration: 0,
    settings,
  }
}

function rejectAll(room, error) {
  for (const item of room.requests) {
    clearTimeout(item.timer)
    io.sockets.sockets.get(item.socketId)?.emit('join:rejected', { error })
  }
  room.requests = []
}

function dropRequests(socketId) {
  for (const room of rooms.values()) {
    const hit = room.requests.some((item) => item.socketId === socketId)
    if (!hit) continue
    for (const item of room.requests) {
      if (item.socketId === socketId) clearTimeout(item.timer)
    }
    room.requests = room.requests.filter((item) => item.socketId !== socketId)
    broadcast(room)
  }
}

function rejectRequest(room, id, error) {
  const item = room.requests.find((entry) => entry.id === id)
  if (!item) return
  clearTimeout(item.timer)
  room.requests = room.requests.filter((entry) => entry.id !== id)
  io.sockets.sockets.get(item.socketId)?.emit('join:rejected', { error })
  if (rooms.has(room.code)) broadcast(room)
}

async function lookup(videoId) {
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return { title: 'Video YouTube', author: '' }
    const data = await res.json()
    return {
      title: String(data.title || 'Video YouTube').slice(0, 140),
      author: String(data.author_name || '').slice(0, 80),
    }
  } catch {
    return { title: 'Video YouTube', author: '' }
  }
}

function replyOf(ack) {
  return typeof ack === 'function' ? ack : () => {}
}

function roomOf(socket) {
  const code = socket.data.code
  if (!code) return null
  return rooms.get(code) || null
}

io.on('connection', (socket) => {
  socket.on('room:create', async (payload, ack) => {
    const reply = replyOf(ack)
    const name = cleanName(payload?.name)
    if (!name) return reply({ ok: false, error: 'Tên cần từ 2 ký tự' })
    leave(socket)
    dropRequests(socket.id)
    const room = {
      code: makeCode(),
      hostId: socket.id,
      lasers: false,
      screenGlow: true,
      beatLights: true,
      ceiling: false,
      theme: { ...ROOM_THEME },
      users: [],
      queue: [],
      currentIndex: 0,
      player: idlePlayer(),
      messages: [],
      requests: [],
      lastNext: 0,
    }
    const look = appearance()
    room.users.push({ id: socket.id, name, seatId: null, ...look })
    pushMessage(room, { name: 'Rạp', text: `${name} đã mở phòng`, system: true })
    rooms.set(room.code, room)
    socket.data.code = room.code
    socket.data.name = name
    await socket.join(room.code)
    reply({ ok: true, room: publicRoom(room), selfId: socket.id })
  })

  socket.on('room:join', async (payload, ack) => {
    const reply = replyOf(ack)
    const name = cleanName(payload?.name)
    const code = String(payload?.code || '').trim().toUpperCase()
    if (!name) return reply({ ok: false, error: 'Tên cần từ 2 ký tự' })
    const room = rooms.get(code)
    if (!room) return reply({ ok: false, error: 'Không tìm thấy phòng' })
    if (socket.data.code === code && room.users.some((user) => user.id === socket.id)) {
      return reply({ ok: true, room: publicRoom(room), selfId: socket.id })
    }
    if (room.requests.some((item) => item.socketId === socket.id)) {
      return reply({ ok: true, waiting: true })
    }
    leave(socket)
    dropRequests(socket.id)
    if (room.users.length >= TOTAL_SEATS) return reply({ ok: false, error: 'Phòng đã đầy' })
    const id = uid()
    const timer = setTimeout(() => rejectRequest(room, id, 'Chủ phòng không phản hồi'), 90000)
    room.requests.push({ id, socketId: socket.id, name, look: appearance(), timer })
    broadcast(room)
    reply({ ok: true, waiting: true })
  })

  socket.on('room:cancel-join', () => dropRequests(socket.id))

  socket.on('join:decide', async (payload) => {
    const room = roomOf(socket)
    if (!room || socket.id !== room.hostId) return
    const id = String(payload?.id || '')
    const item = room.requests.find((entry) => entry.id === id)
    if (!item) return
    clearTimeout(item.timer)
    room.requests = room.requests.filter((entry) => entry.id !== id)
    const guest = io.sockets.sockets.get(item.socketId)
    if (!payload?.accept || !guest) {
      guest?.emit('join:rejected', { error: payload?.accept ? 'Người đó đã ngắt kết nối' : 'Chủ phòng đã từ chối' })
      broadcast(room)
      return
    }
    if (room.users.length >= TOTAL_SEATS) {
      guest.emit('join:rejected', { error: 'Phòng đã đầy' })
      broadcast(room)
      return
    }
    room.users.push({
      id: guest.id,
      name: item.name,
      seatId: null,
      color: item.look.color,
      hair: item.look.hair,
      pants: item.look.pants,
      skin: item.look.skin,
      style: item.look.style,
    })
    guest.data.code = room.code
    guest.data.name = item.name
    await guest.join(room.code)
    pushMessage(room, { name: 'Rạp', text: `${item.name} vào phòng`, system: true })
    broadcast(room)
    guest.emit('join:accepted', { room: publicRoom(room), selfId: guest.id })
  })

  socket.on('room:leave', () => leave(socket))

  socket.on('look:set', (payload) => {
    const room = roomOf(socket)
    if (!room) return
    const user = room.users.find((item) => item.id === socket.id)
    if (!user) return
    applyLook(user, payload)
    broadcast(room)
  })

  socket.on('seat:face', (payload) => {
    const room = roomOf(socket)
    if (!room) return
    const user = room.users.find((item) => item.id === socket.id)
    if (!user || !user.seatId) return
    applySeatFace(user, payload)
    broadcast(room)
  })

  socket.on('seat:claim', (seatId, ack) => {
    const reply = replyOf(ack)
    const room = roomOf(socket)
    if (!room) return reply({ ok: false, error: 'Bạn chưa ở trong phòng' })
    if (!isValidSeat(seatId)) return reply({ ok: false, error: 'Ghế không hợp lệ' })
    const user = room.users.find((item) => item.id === socket.id)
    if (!user) return reply({ ok: false, error: 'Bạn chưa ở trong phòng' })
    if (user.seatId === seatId) {
      user.seatId = null
      pushMessage(room, { name: 'Rạp', text: `${user.name} rời ghế ${seatLabel(seatId)}`, system: true })
    } else if (room.users.some((item) => item.seatId === seatId)) {
      return reply({ ok: false, error: 'Ghế này đã có người' })
    } else {
      const moved = Boolean(user.seatId)
      user.seatId = seatId
      pushMessage(room, {
        name: 'Rạp',
        text: moved ? `${user.name} chuyển sang ghế ${seatLabel(seatId)}` : `${user.name} ngồi ghế ${seatLabel(seatId)}`,
        system: true,
      })
    }
    broadcast(room)
    reply({ ok: true })
  })

  socket.on('queue:add', async (payload, ack) => {
    const reply = replyOf(ack)
    const room = roomOf(socket)
    if (!room) return reply({ ok: false, error: 'Bạn chưa ở trong phòng' })
    if (socket.id !== room.hostId) return reply({ ok: false, error: 'Chỉ chủ phòng được chọn bài' })
    const videoId = String(payload?.videoId || '').trim()
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return reply({ ok: false, error: 'Video không hợp lệ' })
    if (room.queue.length >= 30) return reply({ ok: false, error: 'Hàng chờ đã đầy' })
    const givenTitle = String(payload?.title || '').replace(/\s+/g, ' ').trim().slice(0, 140)
    const givenAuthor = String(payload?.author || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    const meta = givenTitle ? { title: givenTitle, author: givenAuthor } : await lookup(videoId)
    const shouldStart = room.queue.length === 0 || room.player.status === 'idle'
    room.queue.push({ id: uid(), videoId, title: meta.title, author: meta.author })
    if (shouldStart) startTrack(room, room.queue.length - 1)
    pushMessage(room, { name: 'Rạp', text: `Đã thêm “${meta.title}”`, system: true })
    broadcast(room)
    reply({ ok: true })
  })

  socket.on('queue:play', (index) => {
    const room = roomOf(socket)
    if (!room || socket.id !== room.hostId) return
    const next = Number(index)
    if (!room.queue[next]) return
    startTrack(room, next)
    broadcast(room)
  })

  socket.on('queue:remove', (index) => {
    const room = roomOf(socket)
    if (!room || socket.id !== room.hostId) return
    const next = Number(index)
    if (!room.queue[next]) return
    const removingCurrent = next === room.currentIndex
    room.queue.splice(next, 1)
    if (room.queue.length === 0) {
      room.currentIndex = 0
      room.player = idlePlayer(room.player.settings)
    } else if (next < room.currentIndex) {
      room.currentIndex -= 1
    } else if (removingCurrent) {
      startTrack(room, Math.min(next, room.queue.length - 1))
    }
    broadcast(room)
  })

  socket.on('queue:next', () => {
    const room = roomOf(socket)
    if (!room || socket.id !== room.hostId) return
    if (Date.now() - room.lastNext < 1200) return
    room.lastNext = Date.now()
    if (room.currentIndex >= room.queue.length - 1) {
      room.player = { ...room.player, status: 'paused', updatedAt: Date.now() }
      broadcast(room)
      return
    }
    startTrack(room, room.currentIndex + 1)
    broadcast(room)
  })

  socket.on('player:set', (payload) => {
    const room = roomOf(socket)
    if (!room || socket.id !== room.hostId) return
    if (room.player.status === 'idle') return
    const status = payload?.status === 'paused' ? 'paused' : 'playing'
    const time = Math.max(0, Number(payload?.time) || 0)
    room.player = { ...room.player, status, time, updatedAt: Date.now() }
    broadcast(room)
  })

  socket.on('player:sync', (payload) => {
    const room = roomOf(socket)
    if (!room || socket.id !== room.hostId) return
    if (room.player.status === 'idle') return
    room.player = {
      ...room.player,
      time: Math.max(0, Number(payload?.time) || 0),
      updatedAt: Date.now(),
    }
    socket.to(room.code).emit('room:update', publicRoom(room))
  })

  socket.on('theme:set', (payload) => {
    const room = roomOf(socket)
    if (!room || socket.id !== room.hostId) return
    room.theme = cleanTheme(payload, room.theme || ROOM_THEME)
    broadcast(room)
  })

  socket.on('lights:set', (payload) => {
    const room = roomOf(socket)
    if (!room) return
    if (typeof payload?.lasers === 'boolean') room.lasers = payload.lasers
    if (typeof payload?.screenGlow === 'boolean') room.screenGlow = payload.screenGlow
    if (typeof payload?.beatLights === 'boolean') room.beatLights = payload.beatLights
    if (typeof payload?.ceiling === 'boolean') room.ceiling = payload.ceiling
    broadcast(room)
  })

  socket.on('chat:send', (text) => {
    const room = roomOf(socket)
    if (!room) return
    if (Date.now() - (socket.data.lastChat || 0) < 400) return
    const user = room.users.find((item) => item.id === socket.id)
    if (!user) return
    const message = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200)
    if (!message) return
    socket.data.lastChat = Date.now()
    const entry = pushMessage(room, { name: user.name, text: message, system: false, color: user.color })
    broadcast(room)
    io.to(room.code).emit('chat:live', {
      id: entry.id,
      name: entry.name,
      text: entry.text,
      color: entry.color,
    })
  })

  socket.on('reaction', (emoji) => {
    const room = roomOf(socket)
    if (!room) return
    const allow = ['🔥', '👏', '😂', '❤️', '🎬', '✨']
    if (!allow.includes(emoji)) return
    if (Date.now() - (socket.data.lastReact || 0) < 350) return
    socket.data.lastReact = Date.now()
    const user = room.users.find((item) => item.id === socket.id)
    io.to(room.code).emit('reaction', { id: uid(), emoji, name: user?.name || '' })
  })

  socket.on('player:options', (payload) => {
    const room = roomOf(socket)
    if (!room || socket.id !== room.hostId) return
    room.player = { ...room.player, settings: cleanSettings(payload, room.player.settings) }
    broadcast(room)
  })

  socket.on('disconnect', () => {
    dropRequests(socket.id)
    leave(socket)
  })
})

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  if (q.length < 2) return res.json({ videos: [] })
  try {
    const videos = await searchYouTube(q)
    res.json({ videos })
  } catch {
    res.status(502).json({ videos: [], error: 'Không tìm được video' })
  }
})

app.get('/', (_req, res) => {
  res.type('html').send('<p>Barshow API đang chạy. Mở <a href="http://127.0.0.1:5173">http://127.0.0.1:5173</a></p>')
})

httpServer.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`[barshow] api http://127.0.0.1:${PORT}`)
})
