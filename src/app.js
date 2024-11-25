// src/app.js
import express from 'express'
import folderRoutes from './routes/folderRoutes.js' // Importa as rotas de vídeo
import uploadUrlRoutes from './routes/uploadUrlRoutes.js' // Importa as rotas de vídeo
import videoRoutes from './routes/videoRoutes.js' // Importa as rotas de vídeo

const app = express()
const port = 3000

app.use(express.json()) // Middleware para interpretar JSON

// Usa as rotas de vídeo para o endpoint '/video'
app.use('/video', videoRoutes)
app.use('/', folderRoutes)
app.use('/', uploadUrlRoutes)

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
