export type SeatFace = {
  color: string
  style: string
  text: string
  ink: string
  drawing: string
}

export type Member = {
  id: string
  name: string
  color: string
  hair: string
  pants?: string
  skin?: string
  style?: string
  seatId: string | null
  seatFace?: SeatFace
}

export type Track = {
  id: string
  videoId: string
  title: string
  author: string
}

export type PlayerSettings = {
  captions: boolean
  rate: number
  quality: string
}

export type JoinRequest = {
  id: string
  name: string
}

export type Player = {
  status: 'idle' | 'playing' | 'paused'
  time: number
  updatedAt: number
  serverNow: number
  token: string
  duration: number
  settings: PlayerSettings
  clientAnchor?: number
}

export type ChatMessage = {
  id: string
  name: string
  text: string
  at: number
  system?: boolean
  color?: string
}

export type RoomTheme = {
  walls: string
  wallLight: string
  stage: string
  speaker: string
  frame: string
  seats: string
}

export type RoomState = {
  code: string
  hostId: string
  lasers: boolean
  screenGlow: boolean
  beatLights: boolean
  ceiling: boolean
  theme: RoomTheme
  users: Member[]
  queue: Track[]
  currentIndex: number
  player: Player
  messages: ChatMessage[]
  requests: JoinRequest[]
  totalSeats: number
}
