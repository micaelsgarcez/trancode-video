import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import express from 'express'

const router = express.Router()

// Configure o cliente S3 para o Cloudflare R2
const S3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  }
})

// Rota para gerar uma signed URL para upload
router.post('/generate-upload-url', async (req, res) => {
  const { tenantId, fileName } = req.body

  if (!tenantId || !fileName) {
    return res.status(400).json({ error: 'tenantId and fileName are required' })
  }

  try {
    // Defina o bucket e o caminho do arquivo com base no tenantId
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME
    const fileKey = `${tenantId}/${fileName}`

    // Gere a signed URL para upload
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey
    })

    // A URL expira em 1 hora
    const signedUrl = await getSignedUrl(S3, command, { expiresIn: 3600 })

    res.status(200).json({ uploadUrl: signedUrl })
  } catch (err) {
    console.error(err)
    res
      .status(500)
      .json({ error: 'An error occurred while generating the upload URL' })
  }
})

export default router
