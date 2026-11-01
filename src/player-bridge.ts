export const playerBridge = {
  play: () => {},
  pause: () => {},
  currentTime: (): number | null => null,
  duration: (): number | null => null,
  seek: (_seconds: number) => {},
  unmute: () => {},
  mute: () => {},
  isMuted: () => true,
}
