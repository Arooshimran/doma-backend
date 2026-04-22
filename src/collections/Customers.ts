import type { CollectionConfig } from "payload"
import { isAuthenticated } from "@/lib/access-helpers"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import { OAuth2Client } from 'google-auth-library'
import crypto from 'crypto'
import { Resend } from 'resend'

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
const resend = new Resend(process.env.RESEND_API_KEY)

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

    // --- Google Auth Login ---
    {
      path: "/google-login",
      method: "post",
      handler: (async (req: any, res: any) => {
        try {
          const { idToken } = req.body

          const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_CLIENT_ID,
          })

          const payload = ticket.getPayload()
          if (!payload || !payload.email) {
            return res.status(401).json({ error: "Invalid Google Token" })
          }

          const { email, name, sub: googleId } = payload

          const customerSearch = await req.payload.find({
            collection: 'customers',
            where: { email: { equals: email } },
          })

          let userDoc = customerSearch.docs[0]

          if (!userDoc) {
            userDoc = await req.payload.create({
              collection: 'customers',
              data: {
                email,
                Name: name || 'Google User',
                googleId,
                password: crypto.randomBytes(32).toString('hex'),
                status: 'active',
              },
            })
          }

          const result = await req.payload.login({
            collection: "customers",
            data: { email: userDoc.email, password: 'NOT_REQUIRED_BUT_TYPES_NEED_IT' },
            req,
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

    // ✅ NEW: Forgot Password - Send OTP
    {
      path: "/forgot-password",
      method: "post",
      handler: (async (req: any, res: any) => {
        try {
          const { email } = req.body

          if (!email) {
            return res.status(400).json({ error: "Email is required" })
          }

          // Find customer
          const customerSearch = await req.payload.find({
            collection: 'customers',
            where: { email: { equals: email } },
          })

          // Always return success to avoid revealing if email exists
          if (customerSearch.docs.length === 0) {
            return res.status(200).json({
              success: true,
              message: "If this email exists, an OTP has been sent."
            })
          }

          const customer = customerSearch.docs[0]

          // Generate 5-digit OTP
          const otp = Math.floor(10000 + Math.random() * 90000).toString()
          const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 mins

          // Save OTP to customer document
          await req.payload.update({
            collection: 'customers',
            id: customer.id,
            data: {
              resetOtp: otp,
              resetOtpExpiry: otpExpiry,
            },
            overrideAccess: true,
          })

          // Send OTP email via Resend
          await resend.emails.send({
            from: 'DOMA <onboarding@resend.dev>',
            to: email,
            subject: 'Your DOMA Password Reset Code',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
                <h2 style="color: #2d6a4f;">Reset Your Password</h2>
                <p>Hi ${(customer as any).Name || 'there'},</p>
                <p>Use the code below to reset your DOMA password. This code expires in <strong>10 minutes</strong>.</p>
                <div style="background: #f4f4f4; border-radius: 10px; padding: 20px; text-align: center; margin: 25px 0;">
                  <span style="font-size: 42px; font-weight: bold; letter-spacing: 10px; color: #2d6a4f;">
                    ${otp}
                  </span>
                </div>
                <p style="color: #999; font-size: 13px;">If you didn't request this, ignore this email.</p>
              </div>
            `,
          })

          return res.status(200).json({
            success: true,
            message: "OTP sent to your email."
          })

        } catch (err: any) {
          console.error("Forgot Password Error:", err.message)
          return res.status(500).json({ error: "Failed to send OTP" })
        }
      }) as any,
    },

    // ✅ NEW: Verify OTP + Reset Password
    {
      path: "/verify-otp",
      method: "post",
      handler: (async (req: any, res: any) => {
        try {
          const { email, otp, newPassword } = req.body

          if (!email || !otp || !newPassword) {
            return res.status(400).json({ error: "Email, OTP and new password are required" })
          }

          if (newPassword.length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters" })
          }

          // Find customer
          const customerSearch = await req.payload.find({
            collection: 'customers',
            where: { email: { equals: email } },
            overrideAccess: true,
          })

          if (customerSearch.docs.length === 0) {
            return res.status(404).json({ error: "Customer not found" })
          }

          const customer = customerSearch.docs[0] as any

          // Check OTP exists
          if (!customer.resetOtp || !customer.resetOtpExpiry) {
            return res.status(400).json({ error: "No OTP requested. Please request a new one." })
          }

          // Check OTP expiry
          if (new Date() > new Date(customer.resetOtpExpiry)) {
            return res.status(400).json({ error: "OTP has expired. Please request a new one." })
          }

          // Check OTP match
          if (customer.resetOtp !== otp) {
            return res.status(400).json({ error: "Incorrect OTP. Please try again." })
          }

          // ✅ Reset password and clear OTP
          await req.payload.update({
            collection: 'customers',
            id: customer.id,
            data: {
              password: newPassword,
              resetOtp: null,
              resetOtpExpiry: null,
            },
            overrideAccess: true,
          })

          return res.status(200).json({
            success: true,
            message: "Password reset successfully. Please log in."
          })

        } catch (err: any) {
          console.error("Verify OTP Error:", err.message)
          return res.status(500).json({ error: "Failed to verify OTP" })
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

    // ✅ NEW: OTP fields for password reset
    {
      name: "resetOtp",
      type: "text",
      admin: { readOnly: true },
    },
    {
      name: "resetOtpExpiry",
      type: "text",
      admin: { readOnly: true },
    },
  ],
}

export default Customers