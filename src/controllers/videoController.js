import { processPresets } from '../services/ffmpegService.js'

export async function processVideo(req, res) {
  const { videoUrl } = req.body

  if (!videoUrl) {
    return res.status(400).json({ error: 'videoUrl is required' })
  }

  try {
    const input = { pathname: videoUrl }

    // Processar o vídeo em segundo plano
    setImmediate(async () => {
      try {
        console.log(`Processing video: ${videoUrl}`)
        await processPresets(input)
        console.log(`Video processing completed for: ${videoUrl}`)
      } catch (err) {
        console.error(`Error processing video: ${videoUrl}`, err)
      }
    })

    // Resposta imediata ao cliente
    res.status(202).json({ message: 'Video is being processed', videoUrl })
  } catch (err) {
    console.error(err)
    res
      .status(500)
      .json({ error: 'An error occurred while starting processing' })
  }
}
