import type { CollectionConfig } from "payload"
import { isAuthenticated } from "@/lib/access-helpers"
import { buildCorsHeaders, buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import { OAuth2Client } from 'google-auth-library'
import crypto from 'crypto'
import { Resend } from 'resend'

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
const resend = new Resend(process.env.RESEND_API_KEY)

const corsHeaders = (request?: any) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  })

const corsResponse = (req: any, data: any, status: number = 200) => {
  const origin = req?.headers?.get?.('origin') ?? req?.headers?.origin
  const headers = buildCorsHeaders(origin, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  })
  return new Response(JSON.stringify(data), { status, headers })
}

const Customers: CollectionConfig = {
  slug: "customers",
  auth: true,
  admin: { useAsTitle: "email" },

  hooks: {
    beforeOperation: [
      async ({ operation, args }) => {
        if (operation === 'create') {
          const email = args.data?.email
          if (email) {
            const domain = email.split('@')[1]
            try {
              const dns = await import('dns/promises')
              const records = await dns.resolveMx(domain)
              if (!records || records.length === 0) {
                throw new Error('Email domain does not exist or cannot receive emails.')
              }
            } catch (err: any) {
              if (err.message.includes('domain does not exist') || err.message.includes('cannot receive emails')) throw err
              throw new Error('Invalid email domain.')
            }
          }
        }
        return args
      },
    ],
  },

  endpoints: [
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

    // forgot-password
    {
      path: "/forgot-password",
      method: "options",
      handler: (async (req: any) => corsResponse(req, { message: "OK" })) as any,
    },

    // verify-otp
    {
      path: "/verify-otp",
      method: "options",
      handler: (async (req: any) => corsResponse(req, { message: "OK" })) as any,
    },

    // Send OTP
    {
      path: "/forgot-password",
      method: "post",
      handler: (async (req: any) => {
        try {
          const body = await req.json()
          const { email } = body

          if (!email) {
            return corsResponse(req, { error: "Email is required" }, 400)
          }

          const customerSearch = await req.payload.find({
            collection: 'customers',
            where: { email: { equals: email } },
            overrideAccess: true,
          })

          if (customerSearch.docs.length === 0) {
            return corsResponse(req, { success: true, message: "If this email exists, an OTP has been sent." })
          }

          const customer = customerSearch.docs[0] as any

          const otp = Math.floor(10000 + Math.random() * 90000).toString()
          const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString()

          await req.payload.update({
            collection: 'customers',
            id: customer.id,
            data: {
              resetOtp: otp,
              resetOtpExpiry: otpExpiry,
            },
            overrideAccess: true,
          })

          await resend.emails.send({
            from: 'DOMA <support@thedoma.shop>',
            to: email,
            subject: 'Your DOMA Password Reset Code',
            html: `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
                <title>Password Reset</title>
              </head>
              <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
                  <tr>
                    <td align="center">
                      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

                        <!-- Header -->
                        <tr>
                          <td style="background-color:#1A3126;padding:32px 40px;text-align:center;">
                            <img src="https://res.cloudinary.com/dnokhszdv/image/upload/v1780759093/payload-media/file_yylpmi.png" alt="DOMA" width="140" style="display:block;margin:0 auto;" />
                          </td>
                        </tr>

                        <!-- Accent bar -->
                        <tr>
                          <td style="background:#BB4E2C;height:4px;"></td>
                        </tr>

                        <!-- Body -->
                        <tr>
                          <td style="padding:40px 40px 24px;">
                            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#BB4E2C;text-transform:uppercase;letter-spacing:0.8px;">Password Reset</p>
                            <h1 style="margin:0 0 24px;font-size:28px;font-weight:700;color:#0a0a0a;line-height:1.2;">Reset your password</h1>
                            <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">Hi <strong>${customer.Name || 'there'}</strong>,</p>
                            <p style="margin:0 0 28px;font-size:16px;color:#374151;line-height:1.6;">
                              Use the code below to reset your DOMA password. This code expires in <strong>10 minutes</strong>.
                            </p>

                            <!-- OTP card -->
                            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:28px;">
                              <tr>
                                <td style="padding:32px 24px;text-align:center;">
                                  <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;">Your reset code</p>
                                  <p style="margin:0;font-size:48px;font-weight:700;letter-spacing:16px;color:#1A3126;">${otp}</p>
                                </td>
                              </tr>
                            </table>

                            <p style="margin:0;font-size:14px;color:#9ca3af;line-height:1.6;">
                              If you didn't request a password reset, you can safely ignore this email.
                            </p>
                          </td>
                        </tr>

                        <!-- Footer -->
                        <tr>
                          <td style="padding:24px 40px;border-top:1px solid #e5e7eb;">
                            <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;line-height:1.6;">
                              This email was sent by DOMA Marketplace · <a href="https://www.thedoma.shop" style="color:#9ca3af;">thedoma.shop</a><br/>
                              Questions? Contact us at <a href="mailto:support@thedoma.shop" style="color:#9ca3af;">support@thedoma.shop</a>
                            </p>
                          </td>
                        </tr>

                      </table>
                    </td>
                  </tr>
                </table>
              </body>
              </html>
            `,
            text: `Your DOMA Password Reset Code\n\nHi ${customer.Name || 'there'},\n\nYour reset code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, ignore this email.\n\nDOMA Marketplace · thedoma.shop`,
          })

          return corsResponse(req, { success: true, message: "OTP sent to your email." })

        } catch (err: any) {
          console.error("Forgot Password Error:", err.message)
          return corsResponse(req, { error: "Failed to send OTP" }, 500)
        }
      }) as any,
    },

    // Verify OTP + Reset Password
    {
      path: "/verify-otp",
      method: "post",
      handler: (async (req: any) => {
        try {
          const body = await req.json()
          const { email, otp, newPassword } = body

          if (!email || !otp || !newPassword) {
            return corsResponse(req, { error: "Email, OTP and new password are required" }, 400)
          }

          if (newPassword.length < 6) {
            return corsResponse(req, { error: "Password must be at least 6 characters" }, 400)
          }

          const customerSearch = await req.payload.find({
            collection: 'customers',
            where: { email: { equals: email } },
            overrideAccess: true,
          })

          if (customerSearch.docs.length === 0) {
            return corsResponse(req, { error: "Customer not found" }, 404)
          }

          const customer = customerSearch.docs[0] as any

          if (!customer.resetOtp || !customer.resetOtpExpiry) {
            return corsResponse(req, { error: "No OTP requested. Please request a new one." }, 400)
          }

          if (new Date() > new Date(customer.resetOtpExpiry)) {
            return corsResponse(req, { error: "OTP has expired. Please request a new one." }, 400)
          }

          if (customer.resetOtp !== otp) {
            return corsResponse(req, { error: "Incorrect OTP. Please try again." }, 400)
          }

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

          return corsResponse(req, { success: true, message: "Password reset successfully. Please log in." })

        } catch (err: any) {
          console.error("Verify OTP Error:", err.message)
          return corsResponse(req, { error: "Failed to verify OTP" }, 500)
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
      name: "aiRedesigns",
      type: "array",
      admin: { readOnly: true },
      access: {
        read: ({ req: { user }, doc }: any) => {
          if (user?.role === 'admin') return true
          return user?.id === doc?.id
        },
      },
      fields: [
        { name: "imageUrl", type: "text", required: true },
        { name: "prompt", type: "text" },
        { name: "roomType", type: "text" },
        { name: "createdAt", type: "date" },
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