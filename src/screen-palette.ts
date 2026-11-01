export type ScreenTone = 'left' | 'right' | 'center' | 'top'

export const IDLE_PALETTE: Record<ScreenTone, string> = {
  left: '#5d86ea',
  right: '#b46ae0',
  center: '#8ea6ef',
  top: '#6f92e4',
}

export const screenPalette: Record<ScreenTone, string> = { ...IDLE_PALETTE }

export function setScreenPalette(next: Record<ScreenTone, string>) {
  screenPalette.left = next.left
  screenPalette.right = next.right
  screenPalette.center = next.center
  screenPalette.top = next.top
}
