function readText(node) {
  if (!node || typeof node !== 'object') return ''
  if (typeof node.simpleText === 'string') return node.simpleText
  if (Array.isArray(node.runs)) return node.runs.map((run) => run?.text || '').join('')
  return ''
}

export async function searchYouTube(query) {
  const res = await fetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0',
    },
    body: JSON.stringify({
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20241001.00.00',
          hl: 'vi',
          gl: 'VN',
        },
      },
      query,
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error('search failed')
  const data = await res.json()
  const videos = []
  const seen = new Set()
  const walk = (node) => {
    if (!node || typeof node !== 'object' || videos.length >= 12) return
    const video = node.videoRenderer
    if (video?.videoId && /^[A-Za-z0-9_-]{11}$/.test(video.videoId) && !seen.has(video.videoId)) {
      seen.add(video.videoId)
      videos.push({
        videoId: video.videoId,
        title: readText(video.title).replace(/\s+/g, ' ').trim().slice(0, 140) || 'Video YouTube',
        author: readText(video.ownerText).replace(/\s+/g, ' ').trim().slice(0, 80),
        length: readText(video.lengthText).replace(/\s+/g, ' ').trim().slice(0, 16),
      })
    }
    for (const value of Object.values(node)) walk(value)
  }
  walk(data)
  return videos
}
