import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CAMERA, ROOM, ROOM_THEME, SCREEN, SEATS, VIEWPOINTS } from '@shared/cinema.js'
import { cameraView } from '../camera-view'
import { paintSeat } from '../seat-face'
import { screenPalette } from '../screen-palette'
import type { ScreenTone } from '../screen-palette'
import type { Member, SeatFace } from '../types'

type Seat = (typeof SEATS)[number]

const DECOR = [
  { id: 'r6-L1', color: '#e6d3ad', hair: '#1b1b1b', pants: '#2c3136', skin: '#f6d3b4', style: 'short' },
  { id: 'r6-R2', color: '#cbb6f2', hair: '#241c18', pants: '#1c2430', skin: '#e0a67a', style: 'long' },
  { id: 'r5-L0', color: '#8fd0c0', hair: '#111111', pants: '#243028', skin: '#c68642', style: 'bun' },
  { id: 'r5-R3', color: '#f0c2d2', hair: '#3a2a22', pants: '#3c3228', skin: '#ffd8c2', style: 'cap' },
  { id: 'r4-L2', color: '#e7d39a', hair: '#1b1b1b', pants: '#151515', skin: '#8d5524', style: 'short' },
  { id: 'r4-R1', color: '#b9d7f5', hair: '#c4a574', pants: '#2c3136', skin: '#f6d3b4', style: 'long' },
  { id: 'r3-R4', color: '#e8b89a', hair: '#111111', pants: '#4a3228', skin: '#a56b45', style: 'bun' },
  { id: 'r7-L2', color: '#d5d8c8', hair: '#1b1b1b', pants: '#1c2430', skin: '#e0a67a', style: 'cap' },
  { id: 'r7-R0', color: '#f4f1ea', hair: '#4a3428', pants: '#243028', skin: '#c68642', style: 'short' },
  { id: 'r2-L3', color: '#c7d7b8', hair: '#6b3a22', pants: '#2c3136', skin: '#ffd8c2', style: 'long' },
  { id: 'r3-L1', color: '#f2b6a0', hair: '#1a1a1a', pants: '#151515', skin: '#8d5524', style: 'bun' },
  { id: 'r5-L4', color: '#9eb8d6', hair: '#1b1b1b', pants: '#3c3228', skin: '#f6d3b4', style: 'cap' },
]

const BEAMS: { color: string; target: [number, number, number] }[] = [
  { color: '#c6ff4a', target: [-2.5, 0.45, 4.6] },
  { color: '#86ff9a', target: [-1.05, 0.4, 5.5] },
  { color: '#6ae7ff', target: [0.3, 0.35, 5.8] },
  { color: '#d2b0ff', target: [1.7, 0.45, 4.2] },
  { color: '#ff7ad9', target: [2.7, 0.3, 2.5] },
  { color: '#ffd36a', target: [-2.15, 0.4, 2.1] },
  { color: '#ff8f6a', target: [1.05, 0.35, 2.3] },
  { color: '#9eb4ff', target: [-0.15, 0.5, 3.4] },
]

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function viewPose(id: string, users: Member[], selfId: string | null) {
  const preset = VIEWPOINTS.find((item) => item.id === id) || VIEWPOINTS[0]
  if (id !== 'seat') return preset
  const me = users.find((user) => user.id === selfId && user.seatId)
  const seat = me ? SEATS.find((item) => item.id === me.seatId) : null
  if (!seat) return preset
  const [x, y, z] = seat.position
  return {
    ...preset,
    position: [x * 0.2, y + 1.32, z + 1.05] as [number, number, number],
    target: [x * 0.12, y + 1.05, -7.2] as [number, number, number],
  }
}

function CameraRig({ users, selfId }: { users: Member[]; selfId: string | null }) {
  const gl = useThree((state) => state.gl)
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const step = event.deltaY > 0 ? 0.07 : -0.07
      cameraView.zoom = Math.min(1.62, Math.max(0.58, cameraView.zoom + step))
      window.dispatchEvent(new Event('barshow-camera'))
    }
    gl.domElement.addEventListener('wheel', onWheel, { passive: false })
    return () => gl.domElement.removeEventListener('wheel', onWheel)
  }, [gl])

  useFrame(({ camera, pointer }) => {
    const pose = viewPose(cameraView.id, users, selfId)
    const [x, y, z] = pose.position
    const [tx, ty, tz] = pose.target
    const zoom = cameraView.zoom
    const px = tx + (x - tx) * zoom
    const py = ty + (y - ty) * zoom
    const pz = tz + (z - tz) * zoom
    camera.position.x += (px + pointer.x * 0.18 - camera.position.x) * 0.08
    camera.position.y += (py + pointer.y * 0.08 - camera.position.y) * 0.08
    camera.position.z += (pz - camera.position.z) * 0.08
    camera.lookAt(tx + pointer.x * 0.1, ty, tz)
  })
  return null
}

const GLASS_W = 1920
const GLASS_H = 1080
const GLASS_SRC = [
  { x: 0, y: 0 },
  { x: GLASS_W, y: 0 },
  { x: GLASS_W, y: GLASS_H },
  { x: 0, y: GLASS_H },
]

function solveHomography(src: { x: number; y: number }[], dst: { x: number; y: number }[]) {
  const rows = src.map((point, index) => {
    const X = dst[index].x
    const Y = dst[index].y
    return [
      [point.x, point.y, 1, 0, 0, 0, -point.x * X, -point.y * X, X],
      [0, 0, 0, point.x, point.y, 1, -point.x * Y, -point.y * Y, Y],
    ]
  }).flat()
  const n = 8
  for (let col = 0; col < n; col += 1) {
    let pivot = col
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row
    }
    if (Math.abs(rows[pivot][col]) < 1e-8) return null
    const swap = rows[col]
    rows[col] = rows[pivot]
    rows[pivot] = swap
    const div = rows[col][col]
    for (let j = col; j <= n; j += 1) rows[col][j] /= div
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue
      const factor = rows[row][col]
      for (let j = col; j <= n; j += 1) rows[row][j] -= factor * rows[col][j]
    }
  }
  const h = rows.map((row) => row[n])
  return `matrix3d(${h[0]},${h[3]},0,${h[6]},${h[1]},${h[4]},0,${h[7]},0,0,1,0,${h[2]},${h[5]},0,1)`
}

function ScreenProjector({ portalRef }: { portalRef: RefObject<HTMLDivElement | null> }) {
  const corners = useMemo(() => {
    const hw = SCREEN.w / 2
    const hh = SCREEN.h / 2
    return [
      new THREE.Vector3(-hw, SCREEN.cy + hh, SCREEN.z),
      new THREE.Vector3(hw, SCREEN.cy + hh, SCREEN.z),
      new THREE.Vector3(hw, SCREEN.cy - hh, SCREEN.z),
      new THREE.Vector3(-hw, SCREEN.cy - hh, SCREEN.z),
    ]
  }, [])
  const scratch = useMemo(() => corners.map(() => new THREE.Vector3()), [corners])

  useEffect(() => {
    const el = portalRef.current
    if (!el) return
    el.style.width = `${GLASS_W}px`
    el.style.height = `${GLASS_H}px`
    el.style.transformOrigin = '0 0'
    el.style.clipPath = 'none'
  }, [portalRef])

  useFrame(({ camera, gl }) => {
    const el = portalRef.current
    if (!el) return
    camera.updateWorldMatrix(true, false)
    const rect = gl.domElement.getBoundingClientRect()
    let hidden = rect.width < 2 || rect.height < 2
    const points = corners.map((corner, index) => {
      const view = scratch[index].copy(corner).applyMatrix4(camera.matrixWorldInverse)
      if (view.z > -0.35) hidden = true
      const projected = view.applyMatrix4(camera.projectionMatrix)
      return {
        x: (projected.x * 0.5 + 0.5) * rect.width + rect.left,
        y: (-projected.y * 0.5 + 0.5) * rect.height + rect.top,
      }
    })
    if (!hidden) {
      let area = 0
      for (let i = 0; i < 4; i += 1) {
        const next = points[(i + 1) % 4]
        area += points[i].x * next.y - next.x * points[i].y
      }
      if (Math.abs(area) < 1200) hidden = true
    }
    if (hidden) {
      el.style.visibility = 'hidden'
      return
    }
    const cx = (points[0].x + points[1].x + points[2].x + points[3].x) / 4
    const cy = (points[0].y + points[1].y + points[2].y + points[3].y) / 4
    const fitted = points.map((point) => {
      const dx = point.x - cx
      const dy = point.y - cy
      const len = Math.hypot(dx, dy) || 1
      return { x: point.x + (dx / len) * 2, y: point.y + (dy / len) * 2 }
    })
    const matrix = solveHomography(GLASS_SRC, fitted)
    if (!matrix) {
      el.style.visibility = 'hidden'
      return
    }
    el.style.visibility = 'visible'
    el.style.transform = matrix
  })
  return null
}

const Shell = memo(function Shell({ walls, wallLight }: { walls: string; wallLight: string }) {
  const wall = useMemo(() => {
    const shape = new THREE.Shape()
    const w = ROOM.halfW * 2
    const h = ROOM.height
    shape.moveTo(-w / 2, 0)
    shape.lineTo(w / 2, 0)
    shape.lineTo(w / 2, h)
    shape.lineTo(-w / 2, h)
    shape.closePath()
    const hw = SCREEN.w / 2
    const hh = SCREEN.h / 2
    const hole = new THREE.Path()
    hole.moveTo(-hw, SCREEN.cy - hh)
    hole.lineTo(-hw, SCREEN.cy + hh)
    hole.lineTo(hw, SCREEN.cy + hh)
    hole.lineTo(hw, SCREEN.cy - hh)
    hole.closePath()
    shape.holes.push(hole)
    return new THREE.ShapeGeometry(shape)
  }, [])
  const floorTex = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#31403a'
    ctx.fillRect(0, 0, 512, 512)
    ctx.fillStyle = '#1c2622'
    ctx.fillRect(228, 0, 56, 512)
    for (let i = 0; i < 2500; i += 1) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.018})`
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(2, 3)
    return texture
  }, [])
  const front = SCREEN.z - 0.06
  const depth = ROOM.backZ - front
  const centerZ = (ROOM.backZ + front) / 2

  useEffect(() => () => {
    wall.dispose()
    floorTex?.dispose()
  }, [wall, floorTex])

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, centerZ]}>
        <planeGeometry args={[ROOM.halfW * 2, depth + 0.4]} />
        <meshStandardMaterial map={floorTex ?? undefined} color={floorTex ? '#ffffff' : '#26332e'} roughness={1} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, ROOM.height, centerZ]}>
        <planeGeometry args={[ROOM.halfW * 2, depth + 0.4]} />
        <meshStandardMaterial color="#101614" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-ROOM.halfW, ROOM.height / 2, centerZ]}>
        <boxGeometry args={[0.28, ROOM.height, depth]} />
        <meshStandardMaterial color={walls} emissive={walls} emissiveIntensity={0.05} roughness={0.94} />
      </mesh>
      <mesh position={[ROOM.halfW, ROOM.height / 2, centerZ]}>
        <boxGeometry args={[0.28, ROOM.height, depth]} />
        <meshStandardMaterial color={walls} emissive={walls} emissiveIntensity={0.05} roughness={0.94} />
      </mesh>
      <mesh position={[0, ROOM.height / 2, ROOM.backZ]}>
        <boxGeometry args={[ROOM.halfW * 2, ROOM.height, 0.28]} />
        <meshStandardMaterial color={walls} emissive={walls} emissiveIntensity={0.04} roughness={1} />
      </mesh>
      <mesh geometry={wall} position={[0, 0, SCREEN.z]}>
        <meshStandardMaterial color={walls} emissive={walls} emissiveIntensity={0.04} roughness={0.94} side={THREE.DoubleSide} />
      </mesh>
      {[-6.2, -4, -1.8, 0.4, 2.6, 4.8, 7, 9.2].map((z) => (
        <group key={z}>
          {[-1, 1].map((side) => (
            <group key={side} position={[side * (ROOM.halfW - 0.2), 3.35, z]}>
              <mesh>
                <boxGeometry args={[0.04, 6.15, 1.28]} />
                <meshStandardMaterial color="#0c0e12" roughness={0.96} />
              </mesh>
              <mesh position={[side * -0.035, -0.85, 0]} rotation={[0, side * -Math.PI / 2, 0]}>
                <planeGeometry args={[0.02, 3.5]} />
                <meshBasicMaterial color={wallLight} toneMapped={false} side={THREE.FrontSide} />
              </mesh>
              <mesh position={[side * -0.06, 1.16, 0]}>
                <boxGeometry args={[0.05, 0.07, 0.18]} />
                <meshStandardMaterial color="#090909" roughness={0.55} metalness={0.45} />
              </mesh>
              <mesh position={[side * -0.095, 1.05, 0]}>
                <sphereGeometry args={[0.045, 18, 14]} />
                <meshBasicMaterial color={wallLight} toneMapped={false} />
              </mesh>
              <mesh position={[side * -0.095, 0.42, 0]}>
                <coneGeometry args={[0.11, 1.2, 14, 1, true]} />
                <meshBasicMaterial color={wallLight} transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      <hemisphereLight args={['#d7e6ff', '#1a2420', 0.48]} />
      <ambientLight intensity={0.2} color="#d5e4dc" />
      <directionalLight position={[-2.5, 7.2, 6]} intensity={0.72} color="#f4f1e8" />
      <pointLight position={[0, 3.6, -2.2]} intensity={14} distance={18} color="#d5e2ff" />
    </group>
  )
})

const ScreenFrame = memo(function ScreenFrame({ frameColor }: { frameColor: string }) {
  const brand = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 160
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#c9d5cc'
    ctx.font = '600 68px Segoe UI, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('BARSHOW  CINÉ', 512, 84)
    const texture = new THREE.CanvasTexture(canvas)
    texture.anisotropy = 8
    return texture
  }, [])
  const hw = SCREEN.w / 2
  const hh = SCREEN.h / 2
  const thick = 0.16
  const overlap = 0.05
  const z = SCREEN.z + 0.02
  const frame = useMemo(() => new THREE.MeshStandardMaterial({ color: '#0c0f0d', roughness: 0.72, metalness: 0.18 }), [])

  useEffect(() => () => {
    brand?.dispose()
    frame.dispose()
  }, [brand, frame])
  useEffect(() => {
    frame.color.set(frameColor)
  }, [frame, frameColor])

  return (
    <group>
      <mesh position={[0, SCREEN.cy + hh + thick / 2 - overlap, z]} material={frame}>
        <boxGeometry args={[SCREEN.w + thick * 2, thick, 0.04]} />
      </mesh>
      <mesh position={[0, SCREEN.cy - hh - thick / 2 + overlap, z]} material={frame}>
        <boxGeometry args={[SCREEN.w + thick * 2, thick, 0.04]} />
      </mesh>
      <mesh position={[-hw - thick / 2 + overlap, SCREEN.cy, z]} material={frame}>
        <boxGeometry args={[thick, SCREEN.h + thick * 2, 0.04]} />
      </mesh>
      <mesh position={[hw + thick / 2 - overlap, SCREEN.cy, z]} material={frame}>
        <boxGeometry args={[thick, SCREEN.h + thick * 2, 0.04]} />
      </mesh>
      {brand && (
        <mesh position={[0, SCREEN.cy - hh - 0.3, SCREEN.z + 0.08]}>
          <planeGeometry args={[2.5, 0.38]} />
          <meshBasicMaterial map={brand} transparent toneMapped={false} />
        </mesh>
      )}
    </group>
  )
})

const STAGE = { width: 10.2, depth: 1.5, height: 0.38 }
const SPEAKER_H = 2.55
const SPEAKER_DRIVERS = [
  { y: 0.46, r: 0.145 },
  { y: -0.14, r: 0.2 },
  { y: -0.78, r: 0.155 },
]

function lift(hex: string, amount: number) {
  const color = new THREE.Color(hex)
  color.lerp(new THREE.Color('#ffffff'), amount)
  return `#${color.getHexString()}`
}

const Stage = memo(function Stage({ color, speaker }: { color: string; speaker: string }) {
  const { width, depth, height } = STAGE
  const centerZ = SCREEN.z + 0.08 + depth / 2
  const lip = useMemo(() => lift(color, 0.16), [color])
  return (
    <group position={[0, height / 2, centerZ]}>
      <mesh>
        <boxGeometry args={[width, height, depth]} />
        <meshStandardMaterial color={color} roughness={0.92} />
      </mesh>
      <mesh position={[0, height / 2 + 0.012, 0]}>
        <boxGeometry args={[width, 0.02, depth]} />
        <meshStandardMaterial color={lip} roughness={0.84} />
      </mesh>
      <Speaker side={-1} color={speaker} />
      <Speaker side={1} color={speaker} />
    </group>
  )
})

const Speaker = memo(function Speaker({ side, color }: { side: -1 | 1; color: string }) {
  const foot = STAGE.height / 2 + SPEAKER_H / 2 + 0.02
  return (
    <group position={[side * (SCREEN.w / 2 + 0.78), foot, -STAGE.depth / 2 + 0.42]}>
      <mesh>
        <boxGeometry args={[0.52, SPEAKER_H, 0.34]} />
        <meshStandardMaterial color={color} roughness={0.72} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.04, 0.16]}>
        <boxGeometry args={[0.4, SPEAKER_H - 0.42, 0.02]} />
        <meshStandardMaterial color="#0c0c0c" roughness={0.55} />
      </mesh>
      <mesh position={[0, 1.02, 0.18]}>
        <boxGeometry args={[0.16, 0.07, 0.012]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.45} metalness={0.35} />
      </mesh>
      {SPEAKER_DRIVERS.map((driver) => (
        <group key={driver.y} position={[0, driver.y, 0.18]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh>
            <cylinderGeometry args={[driver.r, driver.r, 0.02, 28]} />
            <meshStandardMaterial color="#242424" roughness={0.4} metalness={0.4} />
          </mesh>
          <mesh position={[0, 0.016, 0]}>
            <cylinderGeometry args={[driver.r * 0.32, driver.r * 0.72, 0.028, 22]} />
            <meshStandardMaterial color="#101010" roughness={0.55} metalness={0.15} />
          </mesh>
        </group>
      ))}
    </group>
  )
})

const Decks = memo(function Decks() {
  const built = useMemo(() => {
    const sample = SEATS.filter((seat) => seat.row === 0 && seat.side === 'L')
    const minX = Math.min(...sample.map((seat) => seat.position[0]))
    const maxX = Math.max(...sample.map((seat) => seat.position[0]))
    return {
      geo: new THREE.BoxGeometry(maxX - minX + 0.68, 0.08, 0.82),
      leftCenter: (minX + maxX) / 2,
    }
  }, [])
  const deckMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1b2824', roughness: 1 }), [])
  const aisleMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#141c19', roughness: 1 }), [])
  const lampMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#ffc27a', emissive: '#ff9a3c', emissiveIntensity: 1.8 }),
    [],
  )
  useEffect(() => () => {
    built.geo.dispose()
    deckMat.dispose()
    aisleMat.dispose()
    lampMat.dispose()
  }, [built, deckMat, aisleMat, lampMat])

  const rows = [...new Set(SEATS.map((seat) => seat.row))]
  return (
    <group>
      {rows.map((row) => {
        const seat = SEATS.find((item) => item.row === row)!
        return (
          <group key={row}>
            <mesh geometry={built.geo} material={deckMat} position={[built.leftCenter, seat.position[1] - 0.05, seat.position[2]]} />
            <mesh geometry={built.geo} material={deckMat} position={[-built.leftCenter, seat.position[1] - 0.05, seat.position[2]]} />
            <mesh position={[0, seat.position[1] - 0.02, seat.position[2]]} material={aisleMat}>
              <boxGeometry args={[0.86, 0.045, 0.82]} />
            </mesh>
            <mesh position={[-0.4, seat.position[1] + 0.012, seat.position[2]]} material={lampMat}>
              <boxGeometry args={[0.045, 0.02, 0.07]} />
            </mesh>
            <mesh position={[0.4, seat.position[1] + 0.012, seat.position[2]]} material={lampMat}>
              <boxGeometry args={[0.045, 0.02, 0.07]} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
})

type SeatGeos = {
  base: THREE.BoxGeometry
  cushion: THREE.BoxGeometry
  back: THREE.BoxGeometry
  arm: THREE.BoxGeometry
  lip: THREE.BoxGeometry
}

type SeatMats = {
  base: THREE.MeshStandardMaterial
  cushion: THREE.MeshStandardMaterial
  cushionMine: THREE.MeshStandardMaterial
  cushionHover: THREE.MeshStandardMaterial
  back: THREE.MeshStandardMaterial
  backMine: THREE.MeshStandardMaterial
  arm: THREE.MeshStandardMaterial
  lip: THREE.MeshStandardMaterial
}

function SeatBackArt({ face }: { face: SeatFace }) {
  const [map, setMap] = useState<THREE.CanvasTexture | null>(null)
  const texRef = useRef<THREE.CanvasTexture | null>(null)
  useEffect(() => () => {
    texRef.current?.dispose()
    texRef.current = null
  }, [])
  useEffect(() => {
    let dead = false
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 320
    const publish = (img: HTMLImageElement | null) => {
      if (dead) return
      paintSeat(canvas, face, img)
      const tex = new THREE.CanvasTexture(canvas)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.anisotropy = 8
      tex.needsUpdate = true
      texRef.current?.dispose()
      texRef.current = tex
      setMap(tex)
    }
    publish(null)
    if (!face.drawing) return () => { dead = true }
    const img = new Image()
    img.onload = () => publish(img)
    img.src = face.drawing
    return () => { dead = true }
  }, [face.color, face.style, face.text, face.ink, face.drawing])
  if (!map) return null
  return (
    <mesh position={[0, 0, 0.042]}>
      <planeGeometry args={[0.48, 0.36]} />
      <meshBasicMaterial map={map} toneMapped={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  )
}

const SeatMesh = memo(function SeatMesh({
  seat,
  geos,
  mats,
  variant,
  face,
  blocked,
  interactive,
  onPick,
  onHover,
  onLeave,
}: {
  seat: Seat
  geos: SeatGeos
  mats: SeatMats
  variant: 'free' | 'hover' | 'mine'
  face: SeatFace | null
  blocked: boolean
  interactive: boolean
  onPick: (id: string) => void
  onHover: (id: string) => void
  onLeave: (id: string) => void
}) {
  const cushion = variant === 'mine' ? mats.cushionMine : variant === 'hover' ? mats.cushionHover : mats.cushion
  const back = variant === 'mine' ? mats.backMine : mats.back
  return (
    <group
      position={seat.position}
      onClick={(event) => {
        if (!interactive) return
        event.stopPropagation()
        onPick(seat.id)
      }}
      onPointerOver={(event) => {
        if (!interactive) return
        event.stopPropagation()
        document.body.style.cursor = blocked ? 'not-allowed' : 'pointer'
        onHover(seat.id)
      }}
      onPointerOut={() => {
        if (!interactive) return
        document.body.style.cursor = ''
        onLeave(seat.id)
      }}
    >
      <mesh geometry={geos.base} material={mats.base} position={[0, 0.07, -0.02]} />
      <mesh geometry={geos.cushion} material={cushion} position={[0, 0.17, -0.05]} />
      <group position={[0, 0.4, 0.16]} rotation={[0.1, 0, 0]}>
        <mesh geometry={geos.back} material={back} />
        {face && <SeatBackArt face={face} />}
      </group>
      <mesh geometry={geos.lip} material={mats.lip} position={[0, 0.6, 0.14]} />
      <mesh geometry={geos.arm} material={mats.arm} position={[-0.29, 0.24, -0.02]} />
      <mesh geometry={geos.arm} material={mats.arm} position={[0.29, 0.24, -0.02]} />
    </group>
  )
})

function Seats({
  users,
  selfId,
  interactive,
  seatColor,
  onPickSeat,
}: {
  users: Member[]
  selfId: string | null
  interactive: boolean
  seatColor: string
  onPickSeat: (id: string) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const geos = useMemo<SeatGeos>(
    () => ({
      base: new THREE.BoxGeometry(0.48, 0.12, 0.4),
      cushion: new THREE.BoxGeometry(0.54, 0.09, 0.46),
      back: new THREE.BoxGeometry(0.54, 0.42, 0.07),
      arm: new THREE.BoxGeometry(0.055, 0.14, 0.36),
      lip: new THREE.BoxGeometry(0.54, 0.045, 0.06),
    }),
    [],
  )
  const mats = useMemo<SeatMats>(
    () => ({
      base: new THREE.MeshStandardMaterial({ color: '#1b312d', roughness: 0.92 }),
      cushion: new THREE.MeshStandardMaterial({ color: '#3e6e67', roughness: 0.78 }),
      cushionMine: new THREE.MeshStandardMaterial({ color: '#7dcebb', roughness: 0.7, emissive: '#14584a', emissiveIntensity: 0.28 }),
      cushionHover: new THREE.MeshStandardMaterial({ color: '#5c978e', roughness: 0.74 }),
      back: new THREE.MeshStandardMaterial({ color: '#2e554e', roughness: 0.86 }),
      backMine: new THREE.MeshStandardMaterial({ color: '#6fbfa8', roughness: 0.78 }),
      arm: new THREE.MeshStandardMaterial({ color: '#243833', roughness: 0.9 }),
      lip: new THREE.MeshStandardMaterial({ color: '#4e8279', roughness: 0.8 }),
    }),
    [],
  )
  useEffect(() => () => {
    Object.values(geos).forEach((geometry) => geometry.dispose())
    Object.values(mats).forEach((material) => material.dispose())
    document.body.style.cursor = ''
  }, [geos, mats])
  useEffect(() => {
    const paint = (material: THREE.MeshStandardMaterial, hex: string) => {
      material.color.set(hex)
    }
    paint(mats.cushion, seatColor)
    paint(mats.cushionHover, lift(seatColor, 0.22))
    paint(mats.cushionMine, lift(seatColor, 0.4))
    paint(mats.back, lift(seatColor, 0.12))
    paint(mats.backMine, lift(seatColor, 0.32))
    paint(mats.arm, lift(seatColor, 0.08))
    paint(mats.lip, lift(seatColor, 0.2))
    paint(mats.base, lift(seatColor, 0.05))
  }, [mats, seatColor])

  const pickRef = useRef(onPickSeat)
  pickRef.current = onPickSeat
  const onPick = useCallback((id: string) => pickRef.current(id), [])
  const onHover = useCallback((id: string) => setHover(id), [])
  const onLeave = useCallback((id: string) => setHover((current) => (current === id ? null : current)), [])
  const occupied = useMemo(() => {
    const map = new Map<string, Member>()
    users.forEach((user) => {
      if (user.seatId) map.set(user.seatId, user)
    })
    return map
  }, [users])

  return (
    <group>
      {SEATS.map((seat) => {
        const owner = occupied.get(seat.id)
        const mine = Boolean(owner && owner.id === selfId)
        const variant = mine ? 'mine' : hover === seat.id && !owner ? 'hover' : 'free'
        const face = owner?.seatFace || null
        return (
          <SeatMesh
            key={seat.id}
            seat={seat}
            geos={geos}
            mats={mats}
            variant={variant}
            face={face}
            blocked={Boolean(owner && !mine)}
            interactive={interactive}
            onPick={onPick}
            onHover={onHover}
            onLeave={onLeave}
          />
        )
      })}
    </group>
  )
}

function Hair({
  style,
  geo,
  hair,
  cap,
  y,
}: {
  style: string
  geo: PeopleGeo
  hair: THREE.Material
  cap: THREE.Material
  y: number
}) {
  if (style === 'long') {
    return (
      <group>
        <mesh geometry={geo.hair} material={hair} position={[0, y + 0.01, 0.06]} scale={[1.02, 0.46, 0.78]} />
        <mesh geometry={geo.tail} material={hair} position={[0, y - 0.16, 0.13]} />
      </group>
    )
  }
  if (style === 'bun') {
    return (
      <group>
        <mesh geometry={geo.hair} material={hair} position={[0, y, 0.055]} scale={[1.02, 0.44, 0.78]} />
        <mesh geometry={geo.bun} material={hair} position={[0, y + 0.08, 0.05]} />
      </group>
    )
  }
  if (style === 'cap') {
    return (
      <group>
        <mesh geometry={geo.hair} material={hair} position={[0, y - 0.01, 0.045]} scale={[0.96, 0.34, 0.75]} />
        <mesh geometry={geo.cap} material={cap} position={[0, y + 0.03, 0.02]} scale={[1.05, 0.48, 1.02]} />
        <mesh geometry={geo.brim} material={cap} position={[0, y - 0.02, -0.08]} />
      </group>
    )
  }
  return <mesh geometry={geo.hair} material={hair} position={[0, y + 0.01, 0.055]} scale={[1.04, 0.46, 0.8]} />
}

type PeopleGeo = {
  head: THREE.SphereGeometry
  hair: THREE.SphereGeometry
  torso: THREE.BoxGeometry
  leg: THREE.BoxGeometry
  standLeg: THREE.BoxGeometry
  standTorso: THREE.BoxGeometry
  arm: THREE.BoxGeometry
  shoe: THREE.BoxGeometry
  neck: THREE.CylinderGeometry
  ear: THREE.SphereGeometry
  hand: THREE.SphereGeometry
  eye: THREE.SphereGeometry
  tail: THREE.BoxGeometry
  bun: THREE.SphereGeometry
  cap: THREE.SphereGeometry
  brim: THREE.BoxGeometry
}

function Person({
  pose,
  geo,
  shirt,
  hair,
  skin,
  pants,
  shoes,
  cap,
  eye,
  style,
}: {
  pose: 'sit' | 'stand'
  geo: PeopleGeo
  shirt: THREE.Material
  hair: THREE.Material
  skin: THREE.Material
  pants: THREE.Material
  shoes: THREE.Material
  cap: THREE.Material
  eye: THREE.Material
  style: string
}) {
  if (pose === 'stand') {
    return (
      <group>
        <mesh geometry={geo.shoe} material={shoes} position={[-0.08, 0.03, 0.02]} />
        <mesh geometry={geo.shoe} material={shoes} position={[0.08, 0.03, 0.02]} />
        <mesh geometry={geo.standLeg} material={pants} position={[-0.08, 0.28, 0]} />
        <mesh geometry={geo.standLeg} material={pants} position={[0.08, 0.28, 0]} />
        <mesh geometry={geo.standTorso} material={shirt} position={[0, 0.68, 0]} />
        <group position={[-0.17, 0.8, 0]} rotation={[0.15, 0, 0.12]}>
          <mesh geometry={geo.arm} material={shirt} position={[0, -0.1, 0]} />
          <mesh geometry={geo.hand} material={skin} position={[0, -0.22, 0.01]} />
        </group>
        <group position={[0.17, 0.8, 0]} rotation={[0.15, 0, -0.12]}>
          <mesh geometry={geo.arm} material={shirt} position={[0, -0.1, 0]} />
          <mesh geometry={geo.hand} material={skin} position={[0, -0.22, 0.01]} />
        </group>
        <mesh geometry={geo.neck} material={skin} position={[0, 0.9, 0]} />
        <mesh geometry={geo.head} material={skin} position={[0, 1.04, 0]} />
        <mesh geometry={geo.ear} material={skin} position={[-0.11, 1.03, 0]} />
        <mesh geometry={geo.ear} material={skin} position={[0.11, 1.03, 0]} />
        <mesh geometry={geo.eye} material={eye} position={[-0.04, 1.065, -0.115]} />
        <mesh geometry={geo.eye} material={eye} position={[0.04, 1.065, -0.115]} />
        <Hair style={style} geo={geo} hair={hair} cap={cap} y={1.12} />
      </group>
    )
  }
  return (
    <group position={[0, 0.3, -0.04]}>
      <mesh geometry={geo.shoe} material={shoes} position={[-0.08, -0.02, -0.24]} />
      <mesh geometry={geo.shoe} material={shoes} position={[0.08, -0.02, -0.24]} />
      <mesh geometry={geo.leg} material={pants} position={[-0.08, 0.04, -0.1]} rotation={[0.65, 0, 0]} />
      <mesh geometry={geo.leg} material={pants} position={[0.08, 0.04, -0.1]} rotation={[0.65, 0, 0]} />
      <mesh geometry={geo.torso} material={shirt} position={[0, 0.24, 0]} />
      <group position={[-0.16, 0.34, -0.02]} rotation={[0.85, 0.15, 0.25]}>
        <mesh geometry={geo.arm} material={shirt} position={[0, -0.1, 0]} />
        <mesh geometry={geo.hand} material={skin} position={[0, -0.22, 0]} />
      </group>
      <group position={[0.16, 0.34, -0.02]} rotation={[0.85, -0.15, -0.25]}>
        <mesh geometry={geo.arm} material={shirt} position={[0, -0.1, 0]} />
        <mesh geometry={geo.hand} material={skin} position={[0, -0.22, 0]} />
      </group>
      <mesh geometry={geo.neck} material={skin} position={[0, 0.42, 0]} />
      <mesh geometry={geo.head} material={skin} position={[0, 0.52, -0.01]} />
      <mesh geometry={geo.ear} material={skin} position={[-0.11, 0.51, -0.01]} />
      <mesh geometry={geo.ear} material={skin} position={[0.11, 0.51, -0.01]} />
      <mesh geometry={geo.eye} material={eye} position={[-0.04, 0.545, -0.125]} />
      <mesh geometry={geo.eye} material={eye} position={[0.04, 0.545, -0.125]} />
      <Hair style={style} geo={geo} hair={hair} cap={cap} y={0.58} />
    </group>
  )
}

function People({ users, showDeco }: { users: Member[]; showDeco: boolean }) {
  const geo = useMemo(
    () => ({
      head: new THREE.SphereGeometry(0.115, 18, 14),
      hair: new THREE.SphereGeometry(0.122, 16, 12),
      torso: new THREE.BoxGeometry(0.3, 0.3, 0.16),
      leg: new THREE.BoxGeometry(0.09, 0.24, 0.09),
      standLeg: new THREE.BoxGeometry(0.09, 0.5, 0.09),
      standTorso: new THREE.BoxGeometry(0.32, 0.36, 0.16),
      arm: new THREE.BoxGeometry(0.07, 0.22, 0.07),
      shoe: new THREE.BoxGeometry(0.1, 0.045, 0.14),
      neck: new THREE.CylinderGeometry(0.045, 0.052, 0.08, 10),
      ear: new THREE.SphereGeometry(0.028, 8, 8),
      hand: new THREE.SphereGeometry(0.036, 8, 8),
      eye: new THREE.SphereGeometry(0.018, 8, 8),
      tail: new THREE.BoxGeometry(0.18, 0.28, 0.07),
      bun: new THREE.SphereGeometry(0.055, 10, 8),
      cap: new THREE.SphereGeometry(0.118, 12, 8),
      brim: new THREE.BoxGeometry(0.16, 0.018, 0.09),
    }),
    [],
  )
  const shoes = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.55 }), [])
  const capMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#242428', roughness: 0.62 }), [])
  const eyeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1c140f', roughness: 0.4 }), [])
  const shirts = useMemo(() => new Map<string, THREE.MeshStandardMaterial>(), [])
  const hairs = useMemo(() => new Map<string, THREE.MeshStandardMaterial>(), [])
  const pantsMap = useMemo(() => new Map<string, THREE.MeshStandardMaterial>(), [])
  const skins = useMemo(() => new Map<string, THREE.MeshStandardMaterial>(), [])
  useEffect(() => () => {
    Object.values(geo).forEach((geometry) => geometry.dispose())
    shoes.dispose()
    capMat.dispose()
    eyeMat.dispose()
    shirts.forEach((material) => material.dispose())
    hairs.forEach((material) => material.dispose())
    pantsMap.forEach((material) => material.dispose())
    skins.forEach((material) => material.dispose())
  }, [geo, shoes, capMat, eyeMat, shirts, hairs, pantsMap, skins])

  const take = (bucket: Map<string, THREE.MeshStandardMaterial>, color: string) => {
    let material = bucket.get(color)
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: 0.74, metalness: 0.02 })
      bucket.set(color, material)
    }
    return material
  }

  const figures: {
    key: string
    position: [number, number, number]
    color: string
    hair: string
    pants: string
    skin: string
    style: string
    pose: 'sit' | 'stand'
  }[] = []
  users.forEach((user) => {
    if (!user.seatId) return
    const seat = SEATS.find((item) => item.id === user.seatId)
    if (!seat) return
    figures.push({
      key: user.id,
      position: seat.position,
      color: user.color,
      hair: user.hair,
      pants: user.pants || '#2c3136',
      skin: user.skin || '#f6d3b4',
      style: user.style || 'short',
      pose: 'sit',
    })
  })
  if (showDeco) {
    DECOR.forEach((person) => {
      const seat = SEATS.find((item) => item.id === person.id)
      if (!seat) return
      figures.push({
        key: person.id,
        position: seat.position,
        color: person.color,
        hair: person.hair,
        pants: person.pants,
        skin: person.skin,
        style: person.style,
        pose: 'sit',
      })
    })
    const aisle = SEATS.find((item) => item.row === 4)
    if (aisle) {
      figures.push({
        key: 'stand',
        position: [0.05, aisle.position[1], aisle.position[2]],
        color: '#f4f1ea',
        hair: '#1c1c1c',
        pants: '#1c2430',
        skin: '#e0a67a',
        style: 'long',
        pose: 'stand',
      })
    }
  }

  return (
    <group>
      {figures.map((figure) => (
        <group key={figure.key} position={figure.position} scale={figure.pose === 'sit' ? 1.15 : 1}>
          <Person
            pose={figure.pose}
            geo={geo}
            shirt={take(shirts, figure.color)}
            hair={take(hairs, figure.hair)}
            skin={take(skins, figure.skin)}
            pants={take(pantsMap, figure.pants)}
            shoes={shoes}
            cap={capMat}
            eye={eyeMat}
            style={figure.style}
          />
        </group>
      ))}
    </group>
  )
}

function Beam({ color, target }: { color: string; target: [number, number, number] }) {
  const core = useRef<THREE.Mesh>(null)
  const glow = useRef<THREE.Mesh>(null)
  const tmp = useMemo(
    () => ({
      end: new THREE.Vector3(),
      dir: new THREE.Vector3(),
      mid: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      origin: new THREE.Vector3(0, 6.72, -5.15),
    }),
    [],
  )
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    tmp.end.set(
      target[0] + Math.sin(t * 0.33 + target[0]) * 0.28,
      target[1],
      target[2] + Math.cos(t * 0.27 + target[2]) * 0.22,
    )
    tmp.dir.copy(tmp.end).sub(tmp.origin)
    const length = tmp.dir.length()
    tmp.mid.copy(tmp.origin).add(tmp.end).multiplyScalar(0.5)
    tmp.dir.normalize()
    for (const mesh of [core.current, glow.current]) {
      if (!mesh) continue
      mesh.position.copy(tmp.mid)
      mesh.quaternion.setFromUnitVectors(tmp.up, tmp.dir)
      mesh.scale.set(1, length, 1)
    }
  })
  return (
    <group>
      <mesh ref={glow} frustumCulled={false}>
        <cylinderGeometry args={[0.035, 0.055, 1, 8, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.14} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={core} frustumCulled={false}>
        <cylinderGeometry args={[0.007, 0.014, 1, 6, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

function washMap() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  if (!ctx) return texture
  const pixels = ctx.createImageData(128, 128)
  for (let y = 0; y < 128; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      const dx = (x + 0.5) / 128 - 0.5
      const dy = (y + 0.5) / 128 - 0.5
      const falloff = Math.pow(Math.max(0, 1 - Math.hypot(dx, dy) * 2), 1.65)
      const index = (y * 128 + x) * 4
      pixels.data[index] = 255
      pixels.data[index + 1] = 255
      pixels.data[index + 2] = 255
      pixels.data[index + 3] = Math.round(falloff * 255)
    }
  }
  ctx.putImageData(pixels, 0, 0)
  texture.needsUpdate = true
  return texture
}

function Wash({
  map,
  position,
  rotation,
  scale,
  tone,
  opacity,
}: {
  map: THREE.Texture
  position: [number, number, number]
  rotation: [number, number, number]
  scale: [number, number, number]
  tone: ScreenTone
  opacity: number
}) {
  const ref = useRef<THREE.Mesh>(null)
  const goal = useMemo(() => new THREE.Color(screenPalette[tone]), [tone])
  useFrame((_, delta) => {
    const material = ref.current?.material
    if (!(material instanceof THREE.MeshBasicMaterial)) return
    goal.set(screenPalette[tone])
    material.color.lerp(goal, 1 - Math.exp(-delta * 2.4))
  })
  return (
    <mesh ref={ref} position={position} rotation={rotation} scale={scale} frustumCulled={false}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={map}
        color={screenPalette[tone]}
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  )
}

function ScreenSpill() {
  const map = useMemo(washMap, [])
  const lights = useMemo(() => {
    const make = (x: number, targetX: number, targetZ: number) => {
      const light = new THREE.SpotLight('#d5e4ff', 42, 14, 0.48, 1, 1.4)
      light.position.set(x, SCREEN.cy - 0.2, SCREEN.z + 0.45)
      light.target.position.set(targetX, 0.55, targetZ)
      return light
    }
    return [
      make(-1.6, -1.2, 3.6),
      make(0, 0, 4.4),
      make(1.6, 1.2, 3.6),
    ]
  }, [])
  const goals = useMemo(() => lights.map(() => new THREE.Color()), [lights])
  useEffect(() => () => {
    map.dispose()
    lights.forEach((light) => light.dispose())
  }, [map, lights])
  useFrame((_, delta) => {
    const tones: ScreenTone[] = ['left', 'center', 'right']
    const blend = 1 - Math.exp(-delta * 2.4)
    lights.forEach((light, index) => {
      goals[index].set(screenPalette[tones[index]])
      light.color.lerp(goals[index], blend)
    })
  })
  const floor = -Math.PI / 2
  return (
    <group>
      {lights.map((light) => (
        <group key={light.position.x}>
          <primitive object={light} />
          <primitive object={light.target} />
        </group>
      ))}
      <Wash map={map} tone="center" opacity={0.62} position={[0, 0.1, -3.6]} rotation={[floor, 0, 0]} scale={[8.2, 5.6, 1]} />
      <Wash map={map} tone="center" opacity={0.4} position={[0, 0.14, 0.2]} rotation={[floor, 0, 0]} scale={[9.2, 6.8, 1]} />
      <Wash map={map} tone="left" opacity={0.48} position={[-4.15, 2.15, -4.8]} rotation={[0, 0.35, 0]} scale={[1.5, 2.4, 1]} />
      <Wash map={map} tone="left" opacity={0.36} position={[-3.2, 0.12, -2.2]} rotation={[floor, 0, 0.15]} scale={[3.4, 3.6, 1]} />
      <Wash map={map} tone="right" opacity={0.48} position={[4.15, 2.15, -4.8]} rotation={[0, -0.35, 0]} scale={[1.5, 2.4, 1]} />
      <Wash map={map} tone="right" opacity={0.36} position={[3.2, 0.12, -2.2]} rotation={[floor, 0, -0.15]} scale={[3.4, 3.6, 1]} />
      <Wash map={map} tone="top" opacity={0.42} position={[0, 6.35, -6.5]} rotation={[0.55, 0, 0]} scale={[6.4, 1.7, 1]} />
    </group>
  )
}

function HouseLights() {
  const spots = useMemo(() => {
    const make = (x: number, z: number) => {
      const light = new THREE.SpotLight('#fff6ea', 28, 16, 0.42, 1, 1.8)
      light.position.set(x, 6.55, z)
      light.target.position.set(x, 0.2, z)
      return light
    }
    return [
      make(-2.1, -2.2),
      make(2.1, -2.2),
      make(-2.1, 0.8),
      make(2.1, 0.8),
      make(-2.1, 3.6),
      make(2.1, 3.6),
    ]
  }, [])
  useEffect(() => () => {
    spots.forEach((light) => light.dispose())
  }, [spots])
  return (
    <group>
      <hemisphereLight args={['#fff8ee', '#e4e6dc', 1.7]} />
      <ambientLight intensity={0.85} color="#fff6ea" />
      <directionalLight position={[0, 8, 1.5]} intensity={2.4} color="#fff4e2" />
      <pointLight position={[0, 6.4, 0.4]} intensity={22} distance={0} decay={2} color="#fff7ea" />
      <pointLight position={[-3.4, 5.2, -1.2]} intensity={5} distance={0} decay={2} color="#fff4e2" />
      <pointLight position={[3.4, 5.2, -1.2]} intensity={5} distance={0} decay={2} color="#fff4e2" />
      <pointLight position={[-3.4, 5.2, 2.4]} intensity={5} distance={0} decay={2} color="#fff4e2" />
      <pointLight position={[3.4, 5.2, 2.4]} intensity={5} distance={0} decay={2} color="#fff4e2" />
      {spots.map((light) => (
        <group key={`${light.position.x}-${light.position.z}`}>
          <primitive object={light} />
          <primitive object={light.target} />
        </group>
      ))}
    </group>
  )
}

function Lasers() {
  return (
    <group>
      <mesh position={[0, 6.82, -5.15]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.16, 0.2, 0.1, 18]} />
        <meshStandardMaterial color="#111111" metalness={0.55} roughness={0.35} />
      </mesh>
      {BEAMS.map((beam) => (
        <Beam key={beam.color + beam.target.join(',')} color={beam.color} target={beam.target} />
      ))}
    </group>
  )
}

export function CinemaScene({
  portalRef,
  users,
  selfId,
  interactive,
  showDeco,
  lasers,
  screenGlow,
  ceiling,
  theme,
  onPickSeat,
}: {
  portalRef: RefObject<HTMLDivElement | null>
  users: Member[]
  selfId: string | null
  interactive: boolean
  showDeco: boolean
  lasers: boolean
  screenGlow: boolean
  ceiling: boolean
  theme: typeof ROOM_THEME
  onPickSeat: (id: string) => void
}) {
  const [webgl] = useState(supportsWebGL)
  if (!webgl) {
    return <div className="webgl-fallback">Trình duyệt không bật được đồ họa 3D.</div>
  }
  return (
    <Canvas
      className="cinema-canvas"
      dpr={[1, 1.75]}
      gl={{ alpha: true, antialias: true, premultipliedAlpha: false, powerPreference: 'high-performance' }}
      camera={{ position: CAMERA.position, fov: CAMERA.fov, near: 0.1, far: 70 }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor(0x000000, 0)
        camera.lookAt(CAMERA.target[0], CAMERA.target[1], CAMERA.target[2])
      }}
    >
      <CameraRig users={users} selfId={selfId} />
      <ScreenProjector portalRef={portalRef} />
      <Shell walls={theme.walls} wallLight={theme.wallLight} />
      <Stage color={theme.stage} speaker={theme.speaker} />
      <ScreenFrame frameColor={theme.frame} />
      <Decks />
      <Seats users={users} selfId={selfId} interactive={interactive} seatColor={theme.seats} onPickSeat={onPickSeat} />
      <People users={users} showDeco={showDeco} />
      {screenGlow && <ScreenSpill />}
      {ceiling && <HouseLights />}
      {lasers && <Lasers />}
    </Canvas>
  )
}
