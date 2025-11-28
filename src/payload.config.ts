// storage-adapter-import-placeholder
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

// If you want to keep your custom Google callback endpoint, you can.
// But built-in OAuth is usually easier to maintain.
// import { googleAuthHandler } from "src/app/api/auth/google-callback"

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

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },

    // Email configuration - completely optional to prevent build failures
    ...(smtpUser && smtpPass ? {
      email: nodemailerAdapter({
        transport: nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
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
    // cloudinaryPlugin({
    //   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    //   api_key: process.env.CLOUDINARY_API_KEY,
    //   api_secret: process.env.CLOUDINARY_API_SECRET,
    //   // plugin options: folder, public_id rules, etc.
    // })
    // storage-adapter-placeholder
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
