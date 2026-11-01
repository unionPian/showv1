/// <reference types="vite/client" />

interface YTPlayer {
  loadVideoById(opts: { videoId: string; startSeconds?: number }): void
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  mute(): void
  unMute(): void
  isMuted(): boolean
  setVolume(volume: number): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  setPlaybackRate(rate: number): void
  setPlaybackQuality(quality: string): void
  loadModule(module: string): void
  unloadModule(module: string): void
  getOption(module: string, option: string): unknown
  setOption(module: string, option: string, value: unknown): void
  destroy(): void
}

interface Window {
  YT?: {
    Player: new (
      el: HTMLElement,
      opts: {
        width?: string | number
        height?: string | number
        playerVars?: Record<string, string | number>
        events?: {
          onReady?: (event: { target: YTPlayer }) => void
          onStateChange?: (event: { data: number; target: YTPlayer }) => void
          onError?: (event: { data: number }) => void
        }
      },
    ) => YTPlayer
  }
  onYouTubeIframeAPIReady?: () => void
}
