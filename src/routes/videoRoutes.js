// src/routes/videoRoutes.js
import express from 'express'
import { processVideo } from '../controllers/videoController.js' // Importa o controlador

const router = express.Router()

// Define a rota POST para processar o vídeo
router.post('/process-video', processVideo)

export default router
