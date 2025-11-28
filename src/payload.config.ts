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
// import Admins from './collections/Admins'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const smtpUser =
  process.env.SMTP_USER ||
  process.env.NEXT_PUBLIC_SMTP_USER ||
  process.env.EMAIL_USER

const smtpPass =
  process.env.SMTP_PASS ||
  process.env.NEXT_PUBLIC_SMTP_PASS ||
  process.env.EMAIL_PASS

// Fallback to gmail host if not specified, but prefer env var
const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com'

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },

  // Email configuration - FIXED for Production
  ...(smtpUser && smtpPass ? {
    email: nodemailerAdapter({
      transport: nodemailer.createTransport({
        // REMOVED: service: 'gmail', <--- This was the cause of the timeout
        host: smtpHost,
        port: 465, // Force secure port
        secure: true, // Force SSL
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        // detailed debug logs in production to help identify issues
        logger: true, 
        debug: true, 
      }),
      defaultFromAddress: smtpUser,
      defaultFromName: 'DOMA',
    }),
  } : {}),

  // Auth configuration - using Users collection for admin login only
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
    // Admins,
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

  // Derive allowed origins from env for prod safety; fallback to local dev
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