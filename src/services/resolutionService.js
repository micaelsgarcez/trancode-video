import ffmpeg from 'fluent-ffmpeg'
import { withResolvers } from '../utils/promiseUtils.js'

export async function getResolution(input) {
  const { promise, resolve, reject } = withResolvers()
  ffmpeg.ffprobe(input, (err, metadata) => {
    if (err) {
      reject(err)
    } else {
      const videoStream = metadata.streams.find(
        (stream) => stream.codec_type === 'video'
      )
      resolve([videoStream.width, videoStream.height])
    }
  })
  return promise
}
