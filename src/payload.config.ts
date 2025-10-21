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
// import Admins from './collections/Admins'

// If you want to keep your custom Google callback endpoint, you can.
// But built-in OAuth is usually easier to maintain.
// import { googleAuthHandler } from "src/app/api/auth/google-callback"

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const transport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
  },
});

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },

    email: nodemailerAdapter({
    transport,
    defaultFromAddress: process.env.SMTP_USER!,
    defaultFromName: "DOMA",
  }),

  // Optional: keep your custom Google endpoint if you want manual control
  // endpoints: [
  //   {
  //     path: "/api/customers/google",
  //     method: "post",
  //     handler: googleAuthHandler, // your manual Google OAuth callback handler
  //   },
  // ],

  // Add the built-in auth config here:
  auth: {
    collection: Users.slug, // or Customers.slug if Customers collection handles auth
    providers: [
      {
        provider: 'google',
        clientID: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      },
    ],
  },

  collections: [
    Users,
    Customers,
    Categories,
    Products,
    Vendors,
    Media,
    // Admins,
    Orders,
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

cors: {
  origin: [
    'http://localhost:3000', 
    'http://localhost:3001' 
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
},

csrf: [
  "http://localhost:3000", 
  "http://localhost:3001",
],
  cookies: {
    secure: false,
    sameSite: 'lax',
  },
} as any)
