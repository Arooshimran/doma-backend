// src/app/api/admin/vendors/approve/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"

// CORS headers helper
const getCorsHeaders = () => ({
  "Access-Control-Allow-Origin": "http://localhost:3001",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
})

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  })
}

export async function POST(request: NextRequest) {
  console.log("🎯 === VENDOR APPROVAL REQUEST STARTED ===")
  
  try {
    const payload = await getPayloadClient()
    const { vendorId, adminId, approvalNote } = await request.json()

    console.log("📋 Approval request details:", {
      vendorId,
      adminId,
      hasApprovalNote: !!approvalNote
    })

    // Validate required fields
    if (!vendorId) {
      console.error("❌ Missing vendorId")
      return NextResponse.json(
        { error: "Vendor ID is required" },
        { status: 400, headers: getCorsHeaders() }
      )
    }

    // Get vendor details first
    console.log("🔍 Fetching vendor details...")
    const existingVendor = await payload.findByID({
      collection: "vendors",
      id: vendorId,
    })

    if (!existingVendor) {
      console.error("❌ Vendor not found")
      return NextResponse.json(
        { error: "Vendor not found" },
        { status: 404, headers: getCorsHeaders() }
      )
    }

    console.log("✅ Found vendor:", {
      email: existingVendor.email,
      storeName: existingVendor.storeName,
      currentStatus: existingVendor.status
    })

    // Check if already approved
    if (existingVendor.status === "approved") {
      console.log("⚠️ Vendor already approved")
      return NextResponse.json(
        { 
          success: true, 
          message: "Vendor is already approved",
          vendor: existingVendor 
        },
        { status: 200, headers: getCorsHeaders() }
      )
    }

    // Update vendor status
    console.log("🔄 Updating vendor status to approved...")
    const vendor = await payload.update({
      collection: "vendors",
      id: vendorId,
      data: {
        status: "approved",
        approvedBy: adminId,
        approvedAt: new Date().toISOString(),
        approvalNote: approvalNote || "Approved by admin",
      },
    })

    console.log("✅ Vendor status updated successfully")

    // Send approval email using Payload's email system
    console.log("📧 Sending approval email...")
    try {
      await payload.sendEmail({
        to: vendor.email,
        subject: `🎉 Your ${vendor.storeName} vendor application has been approved!`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
              .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 5px 5px; }
              .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>🎉 Congratulations!</h1>
              </div>
              <div class="content">
                <h2>Your vendor application has been approved!</h2>
                <p>Dear ${vendor.storeName} team,</p>
                <p>We're excited to inform you that your vendor application has been <strong>approved</strong>!</p>
                
                <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
                  <h3>📋 Application Details:</h3>
                  <p><strong>Store Name:</strong> ${vendor.storeName}</p>
                  <p><strong>Email:</strong> ${vendor.email}</p>
                  <p><strong>Status:</strong> <span style="color: #28a745; font-weight: bold;">APPROVED</span></p>
                  <p><strong>Approved Date:</strong> ${new Date().toLocaleDateString()}</p>
                  ${approvalNote ? `<p><strong>Admin Note:</strong> ${approvalNote}</p>` : ''}
                </div>

                <p>🚀 <strong>What's next?</strong></p>
                <ul>
                  <li>You can now log in to your vendor dashboard</li>
                  <li>Start adding your products to the marketplace</li>
                  <li>Set up your store profile and branding</li>
                  <li>Begin receiving customer orders</li>
                </ul>

                <a href="http://localhost:3001/vendor/login" class="button">Login to Dashboard</a>

                <p>If you have any questions, please don't hesitate to contact our support team.</p>
                <p>Welcome to the marketplace! 🎊</p>
              </div>
              <div class="footer">
                <p>This is an automated message from your marketplace platform.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        // Plain text fallback
        text: `
          Congratulations! Your vendor application has been approved!
          
          Store Name: ${vendor.storeName}
          Email: ${vendor.email}
          Status: APPROVED
          Approved Date: ${new Date().toLocaleDateString()}
          ${approvalNote ? `Admin Note: ${approvalNote}` : ''}
          
          You can now log in to your vendor dashboard and start selling!
          Login URL: http://localhost:3001/auth/vendor-login
          
          Welcome to the marketplace!
        `
      })

      console.log("✅ Approval email sent successfully")
    } catch (emailError: any) {
      console.error("❌ Failed to send approval email:", emailError.message)
      // Don't fail the whole request if email fails
      console.log("⚠️ Continuing despite email failure...")
    }

    console.log("🎉 === VENDOR APPROVAL COMPLETED SUCCESSFULLY ===\n")

    return NextResponse.json(
      {
        success: true,
        message: "Vendor approved successfully and notification email sent",
        vendor: {
          id: vendor.id,
          email: vendor.email,
          storeName: vendor.storeName,
          status: vendor.status,
          approvedAt: vendor.approvedAt,
          approvedBy: vendor.approvedBy,
        },
      },
      {
        status: 200,
        headers: getCorsHeaders(),
      }
    )

  } catch (error: any) {
    console.error("💥 === VENDOR APPROVAL FAILED ===")
    console.error("Approval error:", {
      message: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 3)
    })

    return NextResponse.json(
      {
        error: "Failed to approve vendor",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      {
        status: 500,
        headers: getCorsHeaders(),
      }
    )
  }
}