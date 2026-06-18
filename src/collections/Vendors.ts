import type { CollectionConfig } from "payload"
import { isAdmin, isAdminOrVendor, ownRecord } from "@/lib/access-helpers"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: any) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  })

const Vendors: CollectionConfig = {
  slug: "vendors",
  auth: true,

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
            collection: "vendors",
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
              storeName: result.user.storeName,
              status: result.user.status,
              role: "vendor",
            },
            headers: corsHeaders(req),
          })
        } catch (err: any) {
          console.error("Vendor login failed:", err)
          return res.status(401).json({ message: err?.message || "Login failed" })
        }
      }) as any,
    },
  ],

  admin: {
    useAsTitle: "storeName",
    components: {
      views: {
        edit: {
          Default: {},
        },
      },
    },
  },

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
    beforeChange: [
      async ({ data, req, operation }) => {
        if (operation === "create" && data.storeName) {
          data.slug = data.storeName.toLowerCase().replace(/\s+/g, "-")
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, req, operation, previousDoc }) => {
        if (operation === "update" && doc.status !== previousDoc?.status) {
          try {
            if (doc.status === "approved") {
              await sendVendorApprovalEmail(req.payload, doc)
            } else if (doc.status === "rejected") {
              await sendVendorRejectionEmail(req.payload, doc)
            }
          } catch (emailError: any) {
            console.error("Hook email error:", emailError.message)
          }
        }
      },
    ],
  },

  fields: [
    {
      name: "role",
      type: "select",
      options: [{ label: "Vendor", value: "vendor" }],
      defaultValue: "vendor",
      admin: { readOnly: true },
    },
    {
      name: "email",
      type: "email",
      required: true,
      unique: true,
      access: {
        read: ({ req }) => req.user?.collection === "users",
      },
    },
    {
      name: "status",
      type: "select",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Approved", value: "approved" },
        { label: "Rejected", value: "rejected" },
      ],
      defaultValue: "pending",
      required: true,
      access: {
        update: ({ req }) => req.user?.collection === "users",
      },
    },
    {
      name: "storeName",
      type: "text",
      required: true,
    },
    {
      name: "slug",
      type: "text",
      unique: true,
      admin: { readOnly: true },
    },
    {
      name: "storeDescription",
      type: "textarea",
    },
    {
      name: "storeLogo",
      type: "upload",
      relationTo: "media",
    },
    {
      name: "contactInfo",
      type: "group",
      fields: [
        { name: "phone", type: "text" },
        { name: "address", type: "textarea" },
        { name: "city", type: "text" },
        { name: "country", type: "text" },
      ],
      access: {
        read: ({ req }) => req.user?.collection === "users",
      },
    },
    {
      name: "deliveryCharges",
      type: "number",
      label: "Delivery Charges",
      defaultValue: 2000,
      admin: {
        placeholder: "2000",
        description: "Default delivery charge is PKR 2000. You can override it with your own rate.",
      },
    },
    {
      name: "businessType",
      type: "group",
      fields: [
        {
          name: "businessType",
          type: "select",
          options: [
            { label: "Individual", value: "individual" },
            { label: "Company", value: "company" },
            { label: "Partnership", value: "partnership" },
          ],
        },
      ],
    },
    {
      name: "approvalNote",
      type: "textarea",
      admin: {
        description: "Optional note about the approval",
        condition: (data) => data.status === "approved",
      },
    },
    {
      name: "rejectionReason",
      type: "textarea",
      required: true,
      admin: {
        description: "Please provide a clear reason for rejection",
        condition: (data) => data.status === "rejected",
      },
    },
  ],

  access: {
    create: () => true,
    read: () => true,
    update: ({ req }) => {
      if (isAdmin({ req })) return true
      if (req.user?.collection === "vendors") {
        return ownRecord({ req })
      }
      return false
    },
  },
}

async function sendVendorApprovalEmail(payload: any, vendor: any) {
  try {
    await payload.sendEmail({
      to: vendor.email,
      subject: `You're approved to sell on DOMA`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <title>Vendor Approved</title>
        </head>
        <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

                  <!-- Header -->
                  <tr>
                    <!-- Header -->
<tr>
<td style="background-color: #1A3126; background-image: linear-gradient(#1A3126, #1A3126); padding: 32px 40px; text-align: center;">
<img src="https://res.cloudinary.com/dnokhszdv/image/upload/v1780759093/payload-media/file_yylpmi.png" alt="DOMA" width="140" style="display:block;margin:0 auto;" />
  </td>
</tr>
                  </tr>

                  <!-- Green accent bar -->
                  <tr>
                    <td style="background:#16a34a;height:4px;"></td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="padding:40px 40px 24px;">
                      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#16a34a;text-transform:uppercase;letter-spacing:0.8px;">Vendor Application</p>
                      <h1 style="margin:0 0 24px;font-size:28px;font-weight:700;color:#0a0a0a;line-height:1.2;">You're approved!</h1>
                      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">Hi <strong>${vendor.storeName}</strong>,</p>
                      <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
                        Your vendor application has been reviewed and approved. You can now log in to your dashboard, set up your store, and start listing products on the DOMA marketplace.
                      </p>

                      <!-- Details card -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:28px;">
                        <tr>
                          <td style="padding:20px 24px;">
                            <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;">Application Details</p>
                            <table width="100%" cellpadding="0" cellspacing="0">
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#6b7280;width:140px;">Store Name</td>
                                <td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:500;">${vendor.storeName}</td>
                              </tr>
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#6b7280;">Email</td>
                                <td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:500;">${vendor.email}</td>
                              </tr>
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#6b7280;">Status</td>
                                <td style="padding:6px 0;font-size:14px;font-weight:600;color:#16a34a;">Approved</td>
                              </tr>
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#6b7280;">Date</td>
                                <td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:500;">${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</td>
                              </tr>
                              ${vendor.approvalNote ? `
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#6b7280;vertical-align:top;">Note</td>
                                <td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:500;">${vendor.approvalNote}</td>
                              </tr>` : ""}
                            </table>
                          </td>
                        </tr>
                      </table>

                      <!-- 3D Model Feature callout -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:28px;">
                        <tr>
                          <td style="padding:20px 24px;">
                            <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1d4ed8;">✦ Free 3D Model Generation for AR</p>
                            <p style="margin:0 0 12px;font-size:14px;color:#1e40af;line-height:1.6;">
                              Your first <strong>5 featured products</strong> qualify for <strong>free automatic 3D model generation</strong> through DOMA's AR module — letting customers visualize your furniture in their space before buying.
                            </p>
                            <table width="100%" cellpadding="0" cellspacing="0">
                              <tr><td style="padding:4px 0;font-size:13px;color:#1e40af;">✓&nbsp; Mark a product as <strong>Featured</strong> in your dashboard</td></tr>
                              <tr><td style="padding:4px 0;font-size:13px;color:#1e40af;">✓&nbsp; 3D model is auto-generated within 30–40 minutes</td></tr>
                              <tr><td style="padding:4px 0;font-size:13px;color:#1e40af;">✓&nbsp; First 5 featured products are completely free</td></tr>
                              <tr><td style="padding:4px 0;font-size:13px;color:#374151;">→&nbsp; Additional featured products beyond 5 will be charged</td></tr>
                            </table>
                          </td>
                        </tr>
                      </table>

                      <!-- CTA -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                        <tr>
                          <td align="center">
                            <a href="https://www.thedoma.shop/login/vendor"
                              style="display:inline-block;background:#0a0a0a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.2px;">
                              Go to Vendor Dashboard →
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">
                        Welcome to DOMA. We're glad to have you on board.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding:24px 40px;border-top:1px solid #e5e7eb;">
                      <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;line-height:1.6;">
                        This email was sent by DOMA Marketplace · <a href="https://www.thedoma.shop" style="color:#9ca3af;">thedoma.shop</a><br/>
                        If you didn't apply to become a vendor, please ignore this email.
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
      text: `
You're approved to sell on DOMA!

Hi ${vendor.storeName},

Your vendor application has been reviewed and approved. You can now log in to your dashboard and start listing products.

Application Details:
- Store Name: ${vendor.storeName}
- Email: ${vendor.email}
- Status: Approved
- Date: ${new Date().toLocaleDateString()}
${vendor.approvalNote ? `- Note: ${vendor.approvalNote}` : ""}

FREE 3D MODEL GENERATION FOR AR:
Your first 5 featured products qualify for free automatic 3D model generation through DOMA's AR module. Additional featured products beyond 5 will be charged.

Login to your dashboard: https://www.thedoma.shop/login/vendor

Welcome to DOMA.
      `
    })
  } catch (error: any) {
    console.error("Failed to send approval email:", error.message)
    throw error
  }
}

async function sendVendorRejectionEmail(payload: any, vendor: any) {
  try {
    await payload.sendEmail({
      to: vendor.email,
      subject: `Update on your DOMA vendor application`,
      html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
          <title>Application Update</title>
        </head>
        <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

                  <!-- Header -->
                  <tr>
<td style="background-color: #1A3126; background-image: linear-gradient(#1A3126, #1A3126); padding: 32px 40px; text-align: center;">
    <img src="https://res.cloudinary.com/dnokhszdv/image/upload/v1780759093/payload-media/file_yylpmi.png" alt="DOMA" width="140" style="display:block;margin:0 auto;" />
  </td>
                  </tr>

                  <!-- Red accent bar -->
                  <tr>
                    <td style="background:#dc2626;height:4px;"></td>
                  </tr>

                  <!-- Body -->
                  <tr>
                    <td style="padding:40px 40px 24px;">
                      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#dc2626;text-transform:uppercase;letter-spacing:0.8px;">Vendor Application</p>
                      <h1 style="margin:0 0 24px;font-size:28px;font-weight:700;color:#0a0a0a;line-height:1.2;">Application not approved</h1>
                      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">Hi <strong>${vendor.storeName}</strong>,</p>
                      <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
                        Thank you for applying to sell on DOMA. After careful review, we're unable to approve your application at this time.
                      </p>

                      <!-- Details card -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:20px;">
                        <tr>
                          <td style="padding:20px 24px;">
                            <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;">Application Details</p>
                            <table width="100%" cellpadding="0" cellspacing="0">
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#6b7280;width:140px;">Store Name</td>
                                <td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:500;">${vendor.storeName}</td>
                              </tr>
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#6b7280;">Email</td>
                                <td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:500;">${vendor.email}</td>
                              </tr>
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#6b7280;">Status</td>
                                <td style="padding:6px 0;font-size:14px;font-weight:600;color:#dc2626;">Not Approved</td>
                              </tr>
                              <tr>
                                <td style="padding:6px 0;font-size:14px;color:#6b7280;">Date</td>
                                <td style="padding:6px 0;font-size:14px;color:#0a0a0a;font-weight:500;">${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</td>
                              </tr>
                            </table>
                          </td>
                        </tr>
                      </table>

                      <!-- Rejection reason -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:1px solid #fecaca;border-left:4px solid #dc2626;border-radius:8px;margin-bottom:28px;">
                        <tr>
                          <td style="padding:20px 24px;">
                            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#991b1b;text-transform:uppercase;letter-spacing:0.6px;">Reason for Decision</p>
                            <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">${vendor.rejectionReason}</p>
                          </td>
                        </tr>
                      </table>

                      <!-- What to do next -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:28px;">
                        <tr>
                          <td style="padding:20px 24px;">
                            <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.6px;">What you can do</p>
                            <table width="100%" cellpadding="0" cellspacing="0">
                              <tr><td style="padding:4px 0;font-size:14px;color:#374151;">→&nbsp; Review the reason above carefully</td></tr>
                              <tr><td style="padding:4px 0;font-size:14px;color:#374151;">→&nbsp; Address the concerns mentioned</td></tr>
                              <tr><td style="padding:4px 0;font-size:14px;color:#374151;">→&nbsp; Submit a new application when ready</td></tr>
                              <tr><td style="padding:4px 0;font-size:14px;color:#374151;">→&nbsp; Contact support if you need clarification</td></tr>
                            </table>
                          </td>
                        </tr>
                      </table>

                      <!-- CTA -->
                      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                        <tr>
                          <td align="center">
                            <a href="https://www.thedoma.shop/signup"
                              style="display:inline-block;background:#0a0a0a;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;text-decoration:none;letter-spacing:0.2px;">
                              Submit New Application →
                            </a>
                          </td>
                        </tr>
                      </table>

                      <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">
                        We appreciate your interest in DOMA and hope to work with you in the future.
                      </p>
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding:24px 40px;border-top:1px solid #e5e7eb;">
                      <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;line-height:1.6;">
                        This email was sent by DOMA Marketplace · <a href="https://www.thedoma.shop" style="color:#9ca3af;">thedoma.shop</a><br/>
                        If you didn't apply to become a vendor, please ignore this email.
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
      text: `
Update on your DOMA vendor application

Hi ${vendor.storeName},

Thank you for applying to sell on DOMA. After careful review, we're unable to approve your application at this time.

Application Details:
- Store Name: ${vendor.storeName}
- Email: ${vendor.email}
- Status: Not Approved
- Date: ${new Date().toLocaleDateString()}

Reason for Decision:
${vendor.rejectionReason}

What you can do:
- Review the reason above carefully
- Address the concerns mentioned
- Submit a new application when ready
- Contact support if you need clarification

Submit a new application: https://www.thedoma.shop/signup

DOMA Marketplace · thedoma.shop
      `
    })
  } catch (error: any) {
    console.error("Failed to send rejection email:", error.message)
    throw error
  }
}

export default Vendors