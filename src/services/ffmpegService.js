import ffmpeg from 'fluent-ffmpeg'
import fs from 'node:fs/promises'
import path from 'node:path'
import { listRedisKeys } from '../utils/listRedisKeys.js'
import { withResolvers } from '../utils/promiseUtils.js'
import { generatePlaylist } from './playlistService.js'
import { getResolution } from './resolutionService.js'

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
})

// Configure o cliente S3 para o Cloudflare R2
const S3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  }
})

async function uploadToR2(bucketName, filePath, fileKey) {
  const fileContent = await fs.readFile(filePath)

  const putCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: fileKey,
    Body: fileContent
  })

  await S3.send(putCommand)
  console.log(`Uploaded ${fileKey} to Cloudflare R2`)
  if (fileKey.indexOf('.m3u8') > -1) {
    const response = await fetch(
      'https://memberclass.com.br/api/webhook/video/new',
      {
        method: 'POST',
        body: JSON.stringify([
          {
            lessonId: fileKey.split('/')[1],
            size:
              fileKey.indexOf('master.m3u8') > -1
                ? 0
                : Number(fileKey.split('_')[1].replace('p.m3u8', '')),
            location: `https://stream.movimentohub.com.br/${fileKey}`
          }
        ])
      }
    )
    console.log('response memberclass:', response.ok)
  }
}

export async function transcode(input, preset) {
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME // Nome do seu bucket no Cloudflare R2
  const input_extension = path.extname(input.pathname)
  const input_filename = decodeURI(
    path.basename(input.pathname, input_extension)
  )
  const output_folder = path.resolve('./output', input_filename)
  const m3u8_path = path.join(
    output_folder,
    `${input_filename}_${preset.resolution}p.m3u8`
  )

  console.log(`transcoding ${input.pathname} to ${preset.resolution}p`)

  await fs.mkdir(output_folder, { recursive: true })

  const { promise, resolve, reject } = withResolvers()

  ffmpeg(decodeURI(input.pathname))
    .videoCodec('libx264')
    .audioCodec('aac')
    .videoBitrate(`${preset.bitrate}k`)
    .audioBitrate('128k')
    .outputOptions([
      '-filter:v',
      `scale=-2:${preset.resolution}`,
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-g',
      '48',
      '-keyint_min',
      '48',
      '-sc_threshold',
      '0',
      '-hls_time',
      '4',
      '-hls_playlist_type',
      'vod',
      '-hls_segment_filename',
      `${output_folder}/${input_filename}_${preset.resolution}_%03d.ts`
    ])
    .output(m3u8_path)
    .on('end', async () => {
      const [width, height] = await getResolution(m3u8_path)
      const m3u8_filename = path.basename(m3u8_path)

      // Upload each .ts segment and .m3u8 file to Cloudflare R2
      const segmentFiles = await fs.readdir(output_folder)
      for (const segmentFile of segmentFiles) {
        const segmentPath = path.join(output_folder, segmentFile)
        const r2Key = `${input.tenantId}/${input.lessonId}/${segmentFile}` // Caminho no R2

        await uploadToR2(bucketName, segmentPath, r2Key)
      }

      resolve({
        width,
        height,
        m3u8_path,
        m3u8_filename,
        bitrate: preset.bitrate
      })
    })
    .on('error', (err) => reject(err))
    .run()

  return promise
}

export async function processPresets(input, tenantId, lessonId) {
  const presets = [
    // { resolution: 2160, bitrate: 15000 },
    // { resolution: 1440, bitrate: 10000 },
    { resolution: 1080, bitrate: 8000 },
    // { resolution: 720, bitrate: 5000 },
    { resolution: 480, bitrate: 2500 }
    //{ resolution: 360, bitrate: 1000 }
  ]
  const results = []

  for (const preset of presets) {
    console.log('preset :', preset)
    results.push(await transcode({ ...input, tenantId, lessonId }, preset))
  }

  // Gerar e fazer upload da playlist mestre para o R2
  const playlist = await generatePlaylist(results)
  const masterPlaylistPath = `./output/${path.basename(
    input.pathname,
    path.extname(input.pathname)
  )}/master.m3u8`
  await fs.writeFile(masterPlaylistPath, playlist)
  const masterR2Key = `${tenantId}/${lessonId}/master.m3u8`

  await uploadToR2(
    process.env.CLOUDFLARE_R2_BUCKET_NAME,
    masterPlaylistPath,
    masterR2Key
  )
  await redis.del(
    `video-processing:${lessonId}.${input.pathname.split('.').pop()}`
  )
  const queueVideos = await listRedisKeys('video-queue')
  if (queueVideos.length > 0) {
    const videoUrl = await redis.get(queueVideos[0])
    await redis.del(queueVideos[0])
    await redis.set(
      `video-processing:${lessonId}.${input.pathname.split('.').pop()}`,
      videoUrl
    )
    processPresets({ pathname: videoUrl })
  }
}
