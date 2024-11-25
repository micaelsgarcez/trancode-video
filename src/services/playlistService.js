export async function generatePlaylist(transcodeResults) {
  const playlist = [`#EXTM3U`, `#EXT-X-VERSION:3`]
  for (const result of transcodeResults) {
    playlist.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${result.bitrate * 1000},RESOLUTION=${
        result.width
      }x${result.height}`
    )
    playlist.push(result.m3u8_filename)
  }
  return playlist.join('\n')
}
