import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import 'dotenv/config'
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

// Rota para criar uma pasta
router.post('/folder', async (req, res) => {
  const { tenantId } = req.body

  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId is required' })
  }

  try {
    // Define o bucket e a "pasta" no Cloudflare R2
    const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME
    const folderKey = `${tenantId}/` // Finalize com '/' para representar uma pasta

    // Crie um objeto "vazio" para representar a pasta
    const putObjectCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: folderKey,
      Body: '' // Conteúdo vazio, pois estamos apenas criando a "pasta"
    })

    // Envie o comando para o R2
    await S3.send(putObjectCommand)

    res.status(200).json({ message: 'Folder created successfully' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'An error occurred during processing' })
  }
})

export default router
