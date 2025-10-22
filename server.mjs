import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import express from 'express'
import payload from 'payload'
import dotenv from 'dotenv'
import payloadConfig from './src/payload.config'

dotenv.config()

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT || '3000', 10)

// Initialize Next.js
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(async () => {
  const expressApp = express()

  // ✅ Required for Render or any reverse proxy
  // This allows Payload to trust HTTPS and keep secure cookies working
  expressApp.set('trust proxy', 1)

  // ✅ (Optional) Body parsers (sometimes Payload needs them if you extend Express)
  expressApp.use(express.json())
  expressApp.use(express.urlencoded({ extended: true }))

  // ✅ Initialize Payload
  await payload.init({
    ...payloadConfig,
    secret: process.env.PAYLOAD_SECRET,
    mongoURL: process.env.DATABASE_URI,
    express: expressApp,
    onInit: () => {
      payload.logger.info(`✅ Payload Admin URL: ${payload.getAdminURL()}`)
    },
  })

  // ✅ Debug route (good for testing auth)
  expressApp.get('/debug-user', (req, res) => {
    res.json({
      user: req.user ?? null,
      headers: req.headers,
      cookies: req.cookies,
      message: req.user ? 'Authenticated' : 'No user found',
    })
  })

  // ✅ All other requests go to Next.js
  expressApp.all('*', async (req, res) => {
    const parsedUrl = parse(req.url, true)
    await handle(req, res, parsedUrl)
  })

  // ✅ Start the HTTP server
  createServer(expressApp)
    .once('error', (err) => {
      console.error('❌ Server error:', err)
      process.exit(1)
    })
    .listen(port, hostname, () => {
      console.log(`🚀 Ready on http://${hostname}:${port}`)
    })
})
