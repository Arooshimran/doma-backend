import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { payloadCloudPlugin } from '@payloadcms/payload-cloud'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import nodemailer from "nodemailer";
import SMTPTransport from 'nodemailer/lib/smtp-transport'
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
type ResendSMTPTransportOptions = SMTPTransport.Options & { family?: number }

const resendKey = process.env.RESEND_API_KEY || process.env.SMTP_PASS;
const smtpTransportOptions: ResendSMTPTransportOptions | undefined = resendKey ? {
  host: 'smtp.resend.com',
  // CHANGE: Switch to Port 587 (More reliable on Cloud)
  port: 587,
  // CHANGE: Secure must be FALSE for 587
  secure: false,
  auth: {
    user: 'resend',
    pass: resendKey,
  },
  // IMPORTANT: Force IPv4 again (prevents network hangs)
  family: 4,
  logger: true,
  debug: true,
} : undefined;

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },

  // === EMAIL ADAPTER (RESEND PORT 587) ===
  ...(smtpTransportOptions ? {
    email: nodemailerAdapter({
      transport: nodemailer.createTransport(smtpTransportOptions),
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