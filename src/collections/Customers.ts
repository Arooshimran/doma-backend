import type { CollectionConfig } from "payload"
import { isAuthenticated } from "@/lib/access-helpers"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: any) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  })

const Customers: CollectionConfig = {
  slug: "customers",
  auth: true,

  admin: { useAsTitle: "email" },

  endpoints: [
    {
      path: "/login",
      method: "post",
      handler: (async (req: import('payload').PayloadRequest, res: import('express').Response) => {
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
            return res.status(401).json({
              message: "Login failed",
            })
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
          console.error("Customer login failed:", err)
          return res.status(401).json({
            message: err?.message || "Login failed",
          })
        }
      }) as any,
    },
  ],

  access: {
    create: () => true,
    // 🔥 Globally readable so "Name" can be retrieved for product reviews
    read: () => true, 
    update: isAuthenticated,
    delete: () => false,
  },

  fields: [
    {
      name: "role",
      type: "select",
      defaultValue: "customer",
      options: [
        { label: "Customer", value: "customer" }
      ],
      admin: { readOnly: true },
    },

    { name: "googleId", type: "text", unique: true },

    { 
      name: "email", 
      type: "email", 
      required: true, 
      unique: true,
      access: {
        // 🔥 FIX: Return a boolean by comparing the doc ID with the user ID
        read: ({ req: { user }, doc }) => {
          if (user?.role === 'admin') return true;
          return user?.id === doc?.id;
        },
      },
    },

    { name: "Name", type: "text" }, // Publicly readable for review display

    { 
      name: "phone", 
      type: "text",
      access: {
        read: ({ req: { user }, doc }) => {
          if (user?.role === 'admin') return true;
          return user?.id === doc?.id;
        },
      },
    },

    {
      name: "avatar",
      type: "upload",
      relationTo: "media", // This must match your Media collection slug
      access: {
        // Publicly readable so it shows up next to the Name in reviews
        read: () => true,
      },
    },

    {
      name: "addresses",
      type: "array",
      access: {
        read: ({ req: { user }, doc }) => {
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
      options: ["active", "suspended", "banned"],
      defaultValue: "active",
    },
  ],
}

export default Customers;