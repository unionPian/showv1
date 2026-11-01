declare module '@shared/cinema.js' {
  export const ROWS: number
  export const PER_SIDE: number
  export const TOTAL_SEATS: number
  export const SCREEN: { w: number; h: number; z: number; cy: number }
  export const CAMERA: {
    position: [number, number, number]
    target: [number, number, number]
    fov: number
  }
  export const VIEWPOINTS: Array<{
    id: string
    label: string
    position: [number, number, number]
    target: [number, number, number]
  }>
  export const SEAT_FACE: {
    colors: string[]
    inks: string[]
    styles: string[]
  }
  export const LOOK: {
    shirts: string[]
    hair: string[]
    pants: string[]
    skin: string[]
    styles: string[]
  }
  export const ROOM: { halfW: number; height: number; backZ: number }
  export const ROOM_THEME: {
    walls: string
    wallLight: string
    stage: string
    speaker: string
    frame: string
    seats: string
  }
  export function cleanTheme(
    input: Record<string, string> | null | undefined,
    base?: typeof ROOM_THEME,
  ): typeof ROOM_THEME
  export const SEATS: Array<{
    id: string
    row: number
    side: 'L' | 'R'
    col: number
    position: [number, number, number]
    label: string
  }>
  export function isValidSeat(id: string): boolean
  export function seatLabel(id: string): string
  export function parseYouTube(input: string): string | null
}
