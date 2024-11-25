import express from 'express'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'node:fs/promises'
import path from 'node:path'

const app = express()
const port = 3000

app.use(express.json()) // Para permitir o envio de dados JSON

// Função auxiliar para criar uma Promise com resolvers
function withResolvers() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// Função para obter a resolução do vídeo
async function getResolution(input) {
  const { promise, resolve, reject } = withResolvers()
  ffmpeg.ffprobe(input, (err, metadata) => {
    if (err) {
      reject(err)
    } else {
      const video_stream = metadata.streams.find(
        (stream) => stream.codec_type === 'video'
      )
      resolve([video_stream.width, video_stream.height])
    }
  })
  return promise
}

// Função para gerar a playlist HLS
async function generate_playlist(transcode_results) {
  const playlist = [`#EXTM3U`, `#EXT-X-VERSION:3`]
  for (const result of transcode_results) {
    console.log(
      `generating ${result.height}p playlist. Path: ${result.m3u8_path}`
    )
    playlist.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${result.bitrate * 1000},RESOLUTION=${
        result.width
      }x${result.height}`
    )
    playlist.push(result.m3u8_filename)
  }
  return playlist.join('\n')
}

// Função de transcodificação
async function transcode(input, preset) {
  const input_extension = path.extname(input.pathname)
  const input_filename = decodeURI(
    path.basename(input.pathname, input_extension)
  )
  const output_folder = path.resolve('./output', input_filename)
  const m3u8_path = path.join(
    output_folder,
    `${input_filename}_${preset.resolution}p.m3u8`
  )

  console.log({ input_filename, output_folder })
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
    .on('start', (cmdline) => {
      console.log(`${preset.resolution}p start`)
    })
    .on('codecData', (data) => {
      console.log(
        'Input is ' + data.audio + ' audio ' + 'with ' + data.video + ' video'
      )
    })
    .on('end', async () => {
      console.log(`${preset.resolution}p done`)
      const [width, height] = await getResolution(m3u8_path)
      const m3u8_filename = path.basename(m3u8_path)
      resolve({
        width,
        height,
        m3u8_path,
        m3u8_filename,
        bitrate: preset.bitrate
      })
    })
    .on('error', (err, stdout, stderr) => {
      console.error(`${preset.resolution}p error`)
      console.error(err)
      console.error(stderr)
      reject(err)
    })
    .run()

  return promise
}

// Função para processar os presets
async function process_presets(input) {
  console.time('process_presets')
  const input_extension = path.extname(input.pathname)
  const input_filename = decodeURI(
    path.basename(input.pathname, input_extension)
  )
  const presets = [
    { resolution: 2160, bitrate: 15000 },
    { resolution: 1440, bitrate: 10000 },
    { resolution: 1080, bitrate: 8000 },
    { resolution: 720, bitrate: 5000 },
    { resolution: 480, bitrate: 2500 },
    { resolution: 360, bitrate: 1000 }
  ]
  const results = []
  for (const preset of presets) {
    console.timeLog('process_presets', `transcoding ${preset.resolution}p`)
    const transcode_result = await transcode(input, preset)
    console.log(transcode_result)
    results.push(transcode_result)
  }
  const playlist = await generate_playlist(results)
  await fs.writeFile(`./output/${input_filename}/master.m3u8`, playlist)
  console.timeEnd('process_presets')
}

// Rota para processar o vídeo
app.post('/process-video', async (req, res) => {
  const { videoUrl } = req.body

  if (!videoUrl) {
    return res.status(400).json({ error: 'videoUrl is required' })
  }

  try {
    const input = { pathname: videoUrl }
    await process_presets(input)
    res.status(200).json({ message: 'Video processed successfully' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'An error occurred during processing' })
  }
})

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
