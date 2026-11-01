export type ViewId = 'theater' | 'screen' | 'aisle' | 'crowd' | 'seat'

export const ZOOM_MIN = 0.58
export const ZOOM_MAX = 1.62

export const cameraView: { id: ViewId; zoom: number } = {
  id: 'theater',
  zoom: 1,
}

export function setCameraView(next: Partial<{ id: ViewId; zoom: number }>) {
  if (next.id) cameraView.id = next.id
  if (typeof next.zoom === 'number') {
    cameraView.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next.zoom))
  }
  window.dispatchEvent(new Event('barshow-camera'))
}
