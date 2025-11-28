import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { payloadCloudPlugin } from '@payloadcms/payload-cloud'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
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

const smtpUser =
  process.env.SMTP_USER ||
  process.env.NEXT_PUBLIC_SMTP_USER ||
  process.env.EMAIL_USER

const smtpPass =
  process.env.SMTP_PASS ||
  process.env.NEXT_PUBLIC_SMTP_PASS ||
  process.env.EMAIL_PASS

// Hardcode Gmail host to prevent lookup errors
const smtpHost = 'smtp.gmail.com'

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },

  // === EMAIL CONFIGURATION (FIXED) ===
  ...(smtpUser && smtpPass ? {
    email: nodemailerAdapter({
      transport: nodemailer.createTransport(
        {
          host: smtpHost,
          // CHANGE 1: Use Port 587 (STARTTLS) instead of 465
          port: 587,
          // CHANGE 2: secure must be FALSE for port 587
          secure: false,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
          // CHANGE 3: CRITICAL! Forces IPv4.
          // Node tries IPv6 by default on Render, which Gmail BLOCKS.
          family: 4,

          // Fail fast options so you don't wait 2 minutes to see errors
          connectionTimeout: 10000,
          greetingTimeout: 10000,
          socketTimeout: 10000,

          logger: true,
          debug: true,
        } as SMTPTransport.Options
      ),
      defaultFromAddress: smtpUser,
      defaultFromName: 'DOMA',
    }),
  } : {}),

  // Auth configuration
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