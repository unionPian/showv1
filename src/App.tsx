import { useRef } from 'react'
import { RoomProvider, useRoom } from './room'
import { CinemaScene } from './scene/CinemaScene'
import { ROOM_THEME } from '@shared/cinema.js'
import { Lobby } from './components/Lobby'
import { Hud } from './components/Hud'
import { YouTubeStage } from './components/YouTubeStage'
import { ScreenColor } from './components/ScreenColor'

function Shell() {
  const portalRef = useRef<HTMLDivElement>(null)
  const { room, selfId, claimSeat } = useRoom()

  return (
    <div className="app">
      <div className="screen-portal" ref={portalRef}>
        <YouTubeStage />
      </div>
      <ScreenColor />
      <CinemaScene
        portalRef={portalRef}
        users={room?.users ?? []}
        selfId={selfId}
        interactive={Boolean(room)}
        showDeco={!room}
        lasers={room?.lasers ?? false }
        screenGlow={room?.screenGlow ?? true}
        ceiling={room?.ceiling === true}
        theme={room?.theme ?? ROOM_THEME}
        onPickSeat={claimSeat}
      />
      <div className="vignette" />
      {room ? <Hud /> : <Lobby />}
    </div>
  )
}

export default function App() {
  return (
    <RoomProvider>
      <Shell />
    </RoomProvider>
  )
}
