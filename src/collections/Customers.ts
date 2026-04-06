import type { CollectionConfig } from "payload"
import { isAuthenticated } from "@/lib/access-helpers"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import { OAuth2Client } from 'google-auth-library' 
import crypto from 'crypto' 

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

const corsHeaders = (request?: any) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  })

const Customers: CollectionConfig = {
  slug: "customers",
  auth: true,

  admin: { useAsTitle: "email" },

  endpoints: [
    // --- Existing Email/Password Login ---
    {
      path: "/login",
      method: "post",
      handler: (async (req: any, res: any) => {
        try {
          let email: string | undefined = undefined
          let password: string | undefined = undefined
          if (
            req.body &&
            typeof req.body === 'object' &&
            !('pipe' in req.body) &&
            'email' in req.body &&
            'password' in req.body
          ) {
            email = (req.body as any).email
            password = (req.body as any).password
          }

          if (typeof email !== 'string' || typeof password !== 'string') {
            throw new Error('Email and password are required and must be strings')
          }

          const result = await req.payload.login({
            collection: "customers",
            data: { email, password },
            req,
          })
          
          if (!result.user) {
            return res.status(401).json({ message: "Login failed" })
          }

          return res.status(200).json({
            success: true,
            token: result.token,
            user: {
              id: result.user.id,
              email: result.user.email,
              Name: (result.user as any).Name,
              status: result.user.status,
              role: "customer",
            },
            headers: corsHeaders(req),
          })
        } catch (err: any) {
          return res.status(401).json({ message: err?.message || "Login failed" })
        }
      }) as any,
    },

    // --- 🔥 NEW: Google Auth Login ---
    {
      path: "/google-login",
      method: "post",
      handler: (async (req: any, res: any) => {
        try {
          const { idToken } = req.body

          // 1. Verify the ID Token with Google
          const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID, 
          })
          
          const payload = ticket.getPayload()
          if (!payload || !payload.email) {
            return res.status(401).json({ error: "Invalid Google Token" })
          }

          const { email, name, sub: googleId } = payload

          // 2. Check if customer already exists
          const customerSearch = await req.payload.find({
            collection: 'customers',
            where: { email: { equals: email } },
          })

          let userDoc = customerSearch.docs[0]

          // 3. Create user if they don't exist
          if (!userDoc) {
            userDoc = await req.payload.create({
              collection: 'customers',
              data: {
                email,
                Name: name || 'Google User',
                googleId,
                password: crypto.randomBytes(32).toString('hex'), // Secure random password
                status: 'active',
              },
            })
          }

          // 4. Log the user in to get a JWT
          const result = await req.payload.login({
            collection: "customers",
            data: { email: userDoc.email, password: 'NOT_REQUIRED_BUT_TYPES_NEED_IT' },
            req,
            // We use overrideAccess to bypass password check for social login
            overrideAccess: true, 
          })

          return res.status(200).json({
            success: true,
            token: result.token,
            user: {
              id: userDoc.id,
              email: userDoc.email,
              Name: (userDoc as any).Name,
              status: userDoc.status,
              role: "customer",
            },
            headers: corsHeaders(req),
          })
        } catch (err: any) {
          console.error("Google Login Error:", err.message)
          return res.status(401).json({ error: "Authentication failed" })
        }
      }) as any,
    },
  ],

  access: {
    create: () => true,
    read: () => true, 
    update: isAuthenticated,
    delete: () => true,
  },

  fields: [
    {
      name: "role",
      type: "select",
      defaultValue: "customer",
      options: [{ label: "Customer", value: "customer" }],
      admin: { readOnly: true },
    },
    { name: "googleId", type: "text", unique: true },
    { 
      name: "email", 
      type: "email", 
      required: true, 
      unique: true,
      access: {
        read: ({ req: { user }, doc }: any) => {
          if (user?.role === 'admin') return true;
          return user?.id === doc?.id;
        },
      },
    },
    { name: "Name", type: "text" },
    { 
      name: "phone", 
      type: "text",
      access: {
        read: ({ req: { user }, doc }: any) => {
          if (user?.role === 'admin') return true;
          return user?.id === doc?.id;
        },
      },
    },
    {
      name: "avatar",
      type: "upload",
      relationTo: "media",
      access: { read: () => true },
    },
    {
      name: "addresses",
      type: "array",
      access: {
        read: ({ req: { user }, doc }: any) => {
          if (user?.role === 'admin') return true;
          return user?.id === doc?.id;
        },
      },
      fields: [
        { name: "label", type: "text", required: true },
        { name: "street", type: "text", required: true },
        { name: "city", type: "text", required: true },
        { name: "state", type: "text" },
        { name: "zipCode", type: "text", required: true },
        { name: "country", type: "text", required: true },
        { name: "isDefault", type: "checkbox", defaultValue: false },
      ],
    },
    {
      name: "status",
      type: "select",
      options: [
        { label: "Active", value: "active" },
        { label: "Suspended", value: "suspended" },
        { label: "Banned", value: "banned" }
      ],
      defaultValue: "active",
    },
  ],
}

export default Customers;