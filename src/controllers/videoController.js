import { Redis } from '@upstash/redis'
import fs from 'fs'
import fetch from 'node-fetch'
import path from 'path'
import { processPresets } from '../services/ffmpegService.js'
import { listRedisKeys } from '../utils/listRedisKeys.js'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
})

async function downloadVideo(videoUrl, outputDir) {
  const videoName = path.basename(videoUrl) // Nome do arquivo com base na URL
  const filePath = path.join(outputDir, videoName)

  // Garantir que o diretório de saída exista
  fs.mkdirSync(outputDir, { recursive: true })

  // Fazer o download do vídeo
  const response = await fetch(videoUrl)
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.statusText}`)
  }

  const writeStream = fs.createWriteStream(filePath)
  await new Promise((resolve, reject) => {
    response.body.pipe(writeStream)
    response.body.on('error', reject)
    writeStream.on('finish', resolve)
  })

  return filePath // Retorna o caminho do arquivo salvo
}

export async function processVideo(req, res) {
  const { videoUrl } = req.body

  if (!videoUrl) {
    return res.status(400).json({ error: 'videoUrl is required' })
  }

  try {
    const processingVideos = await listRedisKeys('video-processing')
    const outputDir = path.join(process.cwd(), 'input')
    const tenantId = videoUrl.split('/')[3]
    const lessonId = videoUrl.split('/')[4].split('.')[0]

    if (processingVideos.length < 2) {
      let localPath = null
      // Processar o vídeo em segundo plano
      setImmediate(async () => {
        try {
          console.log(`Downloading video: ${videoUrl}`)
          localPath = await downloadVideo(videoUrl, outputDir) // Baixar o vídeo

          console.log(`Video downloaded to: ${localPath}`)
          const input = { pathname: localPath }

          console.log(`Processing video: ${videoUrl}`)
          await redis.set(
            `video-processing:${videoUrl.split('/').pop()}`,
            videoUrl
          )
          await processPresets(input, tenantId, lessonId)
          console.log(`Video processing completed for: ${videoUrl}`)
        } catch (err) {
          console.error(`Error processing video: ${videoUrl}`, err)
        } finally {
          // Excluir o arquivo local após o processamento, se ele existir
          if (localPath && fs.existsSync(localPath)) {
            fs.unlink(localPath, (err) => {
              if (err) {
                console.error(`Failed to delete file: ${localPath}`, err)
              } else {
                console.log(`File deleted: ${localPath}`)
              }
            })
          }
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
