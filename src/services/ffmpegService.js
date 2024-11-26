import ffmpeg from 'fluent-ffmpeg'
import fs from 'node:fs/promises'
import path from 'node:path'
import { withResolvers } from '../utils/promiseUtils.js'
import { generatePlaylist } from './playlistService.js'
import { getResolution } from './resolutionService.js'

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

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
        const r2Key = `${
          input.pathname.split('/')[3]
        }/${input_filename}/${segmentFile}` // Caminho no R2

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

export async function processPresets(input) {
  const presets = [
    // { resolution: 2160, bitrate: 15000 },
    // { resolution: 1440, bitrate: 10000 },
    { resolution: 1080, bitrate: 8000 }
    // { resolution: 720, bitrate: 5000 },
    // { resolution: 480, bitrate: 2500 }
    //{ resolution: 360, bitrate: 1000 }
  ]
  const results = []

  for (const preset of presets) {
    console.log('preset :', preset)
    results.push(await transcode(input, preset))
  }

  // Gerar e fazer upload da playlist mestre para o R2
  const playlist = await generatePlaylist(results)
  console.log('playlist :', playlist)
  const masterPlaylistPath = `./output/${path.basename(
    input.pathname,
    path.extname(input.pathname)
  )}/master.m3u8`
  await fs.writeFile(masterPlaylistPath, playlist)
  const masterR2Key = `${input.pathname.split('/')[3]}/${
    input.pathname.split('/')[4].split('.')[0]
  }/master.m3u8`

  await uploadToR2(
    process.env.CLOUDFLARE_R2_BUCKET_NAME,
    masterPlaylistPath,
    masterR2Key
  )
}
