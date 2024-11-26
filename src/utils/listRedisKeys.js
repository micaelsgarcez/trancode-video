import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_TOKEN
})

export async function listRedisKeys(pattern) {
  let cursor = 0

  const reply = await redis.scan(cursor, {
    match: `*${pattern}*`,
    count: 100
  })
  console.log(`${pattern} :`, reply[1])

  return reply[1]
}
