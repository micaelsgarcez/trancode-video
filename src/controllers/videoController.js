import { Redis } from '@upstash/redis'
import { processPresets } from '../services/ffmpegService.js'
import { listRedisKeys } from '../utils/listRedisKeys.js'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
})

export async function processVideo(req, res) {
  const { videoUrl } = req.body

  if (!videoUrl) {
    return res.status(400).json({ error: 'videoUrl is required' })
  }

  try {
    const processingVideos = await listRedisKeys('video-processing')
    const input = { pathname: videoUrl }

    if (processingVideos.length < 2) {
      // Processar o vídeo em segundo plano
      setImmediate(async () => {
        try {
          console.log(`Processing video: ${videoUrl}`)
          await redis.set(
            `video-processing:${videoUrl.split('/').pop()}`,
            videoUrl
          )
          await processPresets(input)
          console.log(`Video processing completed for: ${videoUrl}`)
        } catch (err) {
          console.error(`Error processing video: ${videoUrl}`, err)
        }
      })
    } else {
      await redis.set(`video-queue:${videoUrl.split('/').pop()}`, videoUrl)
    }

    // Resposta imediata ao cliente
    res.status(202).json({ message: 'Video is being processed', videoUrl })
  } catch (err) {
    console.error(err)
    res
      .status(500)
      .json({ error: 'An error occurred while starting processing' })
  }
}
