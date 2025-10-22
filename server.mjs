import { createServer } from 'http'
import { parse } from 'url'
import next from 'next'
import express from 'express'
import payload from 'payload'
import dotenv from 'dotenv'
import { pathToFileURL } from 'url'

dotenv.config()

const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(async () => {
  const expressApp = express()

  // Dynamic import of TypeScript config (Next.js will handle the compilation)
  const configPath = pathToFileURL('./src/payload.config.ts').href
  const { default: payloadConfig } = await import(configPath)

  // Initialize Payload with config
  await payload.init({
    ...payloadConfig,
    secret: process.env.PAYLOAD_SECRET,
    mongoURL: process.env.DATABASE_URI,
    express: expressApp,
    onInit: () => {
      console.log(`Payload Admin URL: ${payload.getAdminURL()}`)
    },
  })

  // Debug route to check req.user
  expressApp.get('/debug-user', (req, res) => {
    res.json({ user: req.user ?? null })
  })

  // Let Next.js handle all other requests
  expressApp.all('*', async (req, res) => {
    const parsedUrl = parse(req.url, true)
    await handle(req, res, parsedUrl)
  })

  createServer(expressApp)
    .once('error', (err) => {
      console.error(err)
      process.exit(1)
    })
    .listen(port, hostname, () => {
      console.log(`> Ready on http://${hostname}:${port}`)
    })
})