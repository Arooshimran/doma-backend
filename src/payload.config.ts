import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { payloadCloudPlugin } from '@payloadcms/payload-cloud'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import nodemailer from "nodemailer";
import { nodemailerAdapter } from "@payloadcms/email-nodemailer";
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import Users from './collections/Users'
import Media from './collections/Media'
import Categories from './collections/Categories'
import Orders from './collections/Orders'
import Products from './collections/Products'
import Customers from './collections/Customers'
import Vendors from './collections/Vendors'
import Cart from './collections/Cart'
import Reviews from './collections/Reviews'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// === RESEND CONFIGURATION ===
// 1. We look for RESEND_API_KEY first. 
// If not found, we check SMTP_PASS (just in case you named it that).
const resendKey = process.env.RESEND_API_KEY || process.env.SMTP_PASS;

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },

  // === EMAIL ADAPTER (RESEND SANDBOX) ===
  ...(resendKey ? {
    email: nodemailerAdapter({
      transport: nodemailer.createTransport({
        host: 'smtp.resend.com', // Force Resend Host
        port: 465,               // Force Secure Port
        secure: true,            // Force SSL
        auth: {
          user: 'resend',        // Force Resend Username
          pass: resendKey,       // Your API Key
        },
        logger: true, // Keep logs on for debugging
        debug: true,
      }),
      // SANDBOX REQUIREMENT:
      // You MUST send from this specific address until you verify a domain.
      defaultFromAddress: 'onboarding@resend.dev', 
      defaultFromName: 'DOMA System',
    }),
  } : {}),

  auth: {
    collection: Users.slug,
  },

  collections: [
    Users,
    Customers,
    Cart,
    Categories,
    Products,
    Vendors,
    Media,
    Orders,
    Reviews,
  ],

  editor: lexicalEditor(),

  secret: process.env.PAYLOAD_SECRET || '',

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },

  db: mongooseAdapter({
    url: process.env.DATABASE_URI || '',
  }),

  sharp,

  plugins: [
    payloadCloudPlugin(),
  ],

  cors: {
    origin: (process.env.ALLOWED_ORIGINS ||
      'http://localhost:3000,http://localhost:3001,https://doma-backend.onrender.com')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  },
  
  csrf: (process.env.ALLOWED_ORIGINS ||
    'http://localhost:3000,http://localhost:3001,https://doma-backend.onrender.com')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  
  cookies: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  },
    
} as any)