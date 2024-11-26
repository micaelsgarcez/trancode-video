// src/app.js
import cors from 'cors'
import express from 'express'
import folderRoutes from './routes/folderRoutes.js' // Importa as rotas de pastas
import uploadUrlRoutes from './routes/uploadUrlRoutes.js' // Importa as rotas de upload
import videoRoutes from './routes/videoRoutes.js' // Importa as rotas de vídeo

const app = express()
const port = 3000

const corsOptions = {
  origin: '*', // Lista de origens permitidas
  methods: ['GET', 'POST', 'PUT', 'DELETE'], // Métodos permitidos
  allowedHeaders: ['Content-Type', 'Authorization'] // Cabeçalhos permitidos
}

app.use(cors(corsOptions))

// Middleware para interpretar JSON
app.use(express.json())

// Usa as rotas
app.use('/video', videoRoutes)
app.use('/', folderRoutes)
app.use('/', uploadUrlRoutes)

// Inicia o servidor
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`)
})
