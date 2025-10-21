import express from 'express'
import { getPayload } from 'payload'
import config from './src/payload.config.js'

const app = express()
const PORT = process.env.PORT || 3000
const HOST = '0.0.0.0'

// Initialize Payload
let payload
try {
  payload = await getPayload({
    config,
  })
  console.log('✅ Payload initialized successfully')
} catch (error) {
  console.error('❌ Failed to initialize Payload:', error)
  process.exit(1)
}

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Initialize Payload's Express middleware
app.use(payload.express)

// Start the server
app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`)
  console.log(`📊 Admin panel: http://${HOST}:${PORT}/admin`)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully')
  if (payload) {
    await payload.db.destroy()
  }
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully')
  if (payload) {
    await payload.db.destroy()
  }
  process.exit(0)
})
