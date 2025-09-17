import type { CollectionConfig } from "payload"

const Vendors: CollectionConfig = {
  slug: "vendors",
  auth: true,

  endpoints: [
    {
      path: "/login",
      method: "post",
      handler: (async (req, res) => {
        try {
          const result = await req.payload.login({
            collection: "vendors",
            data: {
              email: req.body.email,
              password: req.body.password,
            },
            req,
            res,
          })

          return res.status(200).json(result)
        } catch (err: any) {
          console.error("❌ Vendor login failed:", err)
          return res.status(401).json({
            message: err?.message || "Login failed",
          })
        }
      }) as any,
    },
  ],

  admin: {
    useAsTitle: "storeName",
    components: {
      views: {
        edit: {
          Default: {
            // You can add quick action buttons here if needed
          },
        },
      },
    },
  },

  // ✅ Enhanced hooks for email notifications
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        // Auto-generate store slug
        if (operation === "create" && data.storeName) {
          data.slug = data.storeName.toLowerCase().replace(/\s+/g, "-")
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, req, operation, previousDoc }) => {
        // Send email when vendor status changes (only when changed via admin panel)
        if (operation === "update" && doc.status !== previousDoc?.status) {
          console.log(`📧 Vendor status changed: ${previousDoc?.status} → ${doc.status}`)
          
          try {
            if (doc.status === "approved") {
              console.log("✅ Sending approval email via hook...")
              await sendVendorApprovalEmail(req.payload, doc)
            } else if (doc.status === "rejected") {
              console.log("❌ Sending rejection email via hook...")
              await sendVendorRejectionEmail(req.payload, doc)
            }
          } catch (emailError: any) {
            console.error("❌ Hook email error:", emailError.message)
            // Don't fail the update if email fails
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
      admin: {
        readOnly: true,
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
      // ✅ Add admin-only access control
      access: {
        update: ({ req }) => {
          // Only users (admins) can change status
          return req.user?.collection === "users"
        },
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
      admin: {
        readOnly: true,
      },
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
    },
    {
      name: "businessInfo",
      type: "group",
      fields: [
        { name: "businessLicense", type: "text" },
        { name: "taxId", type: "text" },
        { name: "businessType", type: "select", options: [
          { label: "Individual", value: "individual" }, 
          { label: "Company", value: "company" }, 
          { label: "Partnership", value: "partnership" }
        ]},
      ],
    },
    // ✅ Enhanced approval/rejection tracking
    {
      name: "approvedBy",
      type: "relationship",
      relationTo: "users",
      admin: {
        readOnly: true,
        condition: (data) => data.status === "approved",
      },
    },
    {
      name: "approvedAt",
      type: "date",
      admin: {
        readOnly: true,
        condition: (data) => data.status === "approved",
      },
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
      name: "rejectedBy",
      type: "relationship",
      relationTo: "users",
      admin: {
        readOnly: true,
        condition: (data) => data.status === "rejected",
      },
    },
    {
      name: "rejectedAt",
      type: "date",
      admin: {
        readOnly: true,
        condition: (data) => data.status === "rejected",
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

  // ✅ Control who can access what
  access: {
    create: () => true, // Anyone can register as vendor
    read: ({ req }) => {
      // Users (admins) can see all, vendors can only see themselves
      if (req.user?.collection === "users") return true
      if (req.user?.collection === "vendors") {
        return { id: { equals: req.user.id } }
      }
      return false
    },
    update: ({ req }) => {
      // Users (admins) can update any vendor, vendors can update themselves (except status)
      if (req.user?.collection === "users") return true
      if (req.user?.collection === "vendors") {
        return { id: { equals: req.user.id } }
      }
      return false
    },
  },
}

// ✅ Enhanced email notification functions using Payload's email system
async function sendVendorApprovalEmail(payload: any, vendor: any) {
  console.log(`📧 Sending approval email to ${vendor.email}`)
  
  try {
    await payload.sendEmail({
      to: vendor.email,
      subject: `🎉 Your ${vendor.storeName} vendor application has been approved!`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #28a745; color: white; padding: 20px; text-align: center;">
            <h1>🎉 Congratulations!</h1>
          </div>
          <div style="padding: 30px; background: #f8f9fa;">
            <h2>Your vendor application has been approved!</h2>
            <p>Dear ${vendor.storeName} team,</p>
            <p>We're excited to inform you that your vendor application has been <strong>approved</strong>!</p>
            
            <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <h3>📋 Application Details:</h3>
              <p><strong>Store Name:</strong> ${vendor.storeName}</p>
              <p><strong>Email:</strong> ${vendor.email}</p>
              <p><strong>Status:</strong> <span style="color: #28a745; font-weight: bold;">APPROVED</span></p>
              <p><strong>Approved Date:</strong> ${new Date().toLocaleDateString()}</p>
            </div>

            <p>🚀 You can now log in to your vendor dashboard and start selling!</p>
            <p style="text-align: center;">
              <a href="http://localhost:3001/vendor/login" style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
                Login to Dashboard
              </a>
            </p>
            <p>Welcome to the marketplace! 🎊</p>
          </div>
        </div>
      `,
      text: `Congratulations! Your vendor application has been approved! You can now log in at: http://localhost:3001/vendor/login`
    })
    
    console.log("✅ Approval email sent successfully")
  } catch (error: any) {
    console.error("❌ Failed to send approval email:", error.message)
    throw error
  }
}

async function sendVendorRejectionEmail(payload: any, vendor: any) {
  console.log(`📧 Sending rejection email to ${vendor.email}`)
  
  try {
    await payload.sendEmail({
      to: vendor.email,
      subject: `Update on your ${vendor.storeName} vendor application`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #dc3545; color: white; padding: 20px; text-align: center;">
            <h1>📋 Application Update</h1>
          </div>
          <div style="padding: 30px; background: #f8f9fa;">
            <h2>Update on your vendor application</h2>
            <p>Dear ${vendor.storeName} team,</p>
            <p>Thank you for your interest in joining our marketplace. After careful review, we are unable to approve your vendor application at this time.</p>
            
            <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
              <h3>📋 Application Details:</h3>
              <p><strong>Store Name:</strong> ${vendor.storeName}</p>
              <p><strong>Email:</strong> ${vendor.email}</p>
              <p><strong>Status:</strong> <span style="color: #dc3545; font-weight: bold;">NOT APPROVED</span></p>
              <p><strong>Review Date:</strong> ${new Date().toLocaleDateString()}</p>
            </div>

            ${vendor.rejectionReason ? `
              <div style="background: white; padding: 20px; border-left: 4px solid #dc3545; border-radius: 5px; margin: 20px 0;">
                <h3>📝 Reason for Decision:</h3>
                <p>${vendor.rejectionReason}</p>
              </div>
            ` : ''}

            <p>We encourage you to reapply once you've addressed any concerns.</p>
            <p style="text-align: center;">
              <a href="http://localhost:3001/vendor/register" style="display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px;">
                Submit New Application
              </a>
            </p>
          </div>
        </div>
      `,
      text: `Update on your vendor application. We are unable to approve your application at this time. ${vendor.rejectionReason ? `Reason: ${vendor.rejectionReason}` : ''} You can reapply at: http://localhost:3001/vendor/register`
    })
    
    console.log("✅ Rejection email sent successfully")
  } catch (error: any) {
    console.error("❌ Failed to send rejection email:", error.message)
    throw error
  }
}

export default Vendors