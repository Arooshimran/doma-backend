// src/app/api/admin/vendors/reject/route.ts
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
  console.log("❌ === VENDOR REJECTION REQUEST STARTED ===")
  
  try {
    const payload = await getPayloadClient()
    const { vendorId, adminId, rejectionReason } = await request.json()

    console.log("📋 Rejection request details:", {
      vendorId,
      adminId,
      hasRejectionReason: !!rejectionReason
    })

    // Validate required fields
    if (!vendorId) {
      console.error("❌ Missing vendorId")
      return NextResponse.json(
        { error: "Vendor ID is required" },
        { status: 400, headers: getCorsHeaders() }
      )
    }

    if (!rejectionReason) {
      console.error("❌ Missing rejection reason")
      return NextResponse.json(
        { error: "Rejection reason is required" },
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

    // Check if already rejected
    if (existingVendor.status === "rejected") {
      console.log("⚠️ Vendor already rejected")
      return NextResponse.json(
        { 
          success: true, 
          message: "Vendor is already rejected",
          vendor: existingVendor 
        },
        { status: 200, headers: getCorsHeaders() }
      )
    }

    // Update vendor status
    console.log("🔄 Updating vendor status to rejected...")
    const vendor = await payload.update({
      collection: "vendors",
      id: vendorId,
      data: {
        status: "rejected",
        rejectedBy: adminId,
        rejectedAt: new Date().toISOString(),
        rejectionReason: rejectionReason,
      },
    })

    console.log("✅ Vendor status updated successfully")

    // Send rejection email using Payload's email system
    console.log("📧 Sending rejection email...")
    try {
      await payload.sendEmail({
        to: vendor.email,
        subject: `Update on your ${vendor.storeName} vendor application`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
              .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 5px 5px; }
              .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
              .reason-box { background: white; padding: 20px; border-left: 4px solid #dc3545; border-radius: 5px; margin: 20px 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>📋 Application Update</h1>
              </div>
              <div class="content">
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

                <div class="reason-box">
                  <h3>📝 Reason for Decision:</h3>
                  <p>${rejectionReason}</p>
                </div>

                <p>🔄 <strong>What you can do:</strong></p>
                <ul>
                  <li>Review the feedback provided above</li>
                  <li>Address any issues mentioned in the reason</li>
                  <li>Submit a new application when ready</li>
                  <li>Contact our support team if you have questions</li>
                </ul>

                <p><strong>We encourage you to reapply</strong> once you've addressed the concerns mentioned above. We appreciate your interest in our marketplace and look forward to potentially working with you in the future.</p>

                <a href="http://localhost:3001/vendor/register" class="button">Submit New Application</a>

                <p>If you have any questions about this decision, please don't hesitate to contact our support team.</p>
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
          Update on your vendor application
          
          Dear ${vendor.storeName} team,
          
          Thank you for your interest in joining our marketplace. After careful review, we are unable to approve your vendor application at this time.
          
          Store Name: ${vendor.storeName}
          Email: ${vendor.email}
          Status: NOT APPROVED
          Review Date: ${new Date().toLocaleDateString()}
          
          Reason for Decision:
          ${rejectionReason}
          
          What you can do:
          - Review the feedback provided above
          - Address any issues mentioned in the reason  
          - Submit a new application when ready
          - Contact our support team if you have questions
          
          We encourage you to reapply once you've addressed the concerns mentioned above.
          
          Reapply URL: http://localhost:3001/vendor/register
        `
      })

      console.log("✅ Rejection email sent successfully")
    } catch (emailError: any) {
      console.error("❌ Failed to send rejection email:", emailError.message)
      // Don't fail the whole request if email fails
      console.log("⚠️ Continuing despite email failure...")
    }

    console.log("✅ === VENDOR REJECTION COMPLETED SUCCESSFULLY ===\n")

    return NextResponse.json(
      {
        success: true,
        message: "Vendor rejected and notification email sent",
        vendor: {
          id: vendor.id,
          email: vendor.email,
          storeName: vendor.storeName,
          status: vendor.status,
          rejectedAt: vendor.rejectedAt,
          rejectionReason: vendor.rejectionReason,
          rejectedBy: vendor.rejectedBy,
        },
      },
      {
        status: 200,
        headers: getCorsHeaders(),
      }
    )

  } catch (error: any) {
    console.error("💥 === VENDOR REJECTION FAILED ===")
    console.error("Rejection error:", {
      message: error.message,
      name: error.name,
      stack: error.stack?.split('\n').slice(0, 3)
    })

    return NextResponse.json(
      {
        error: "Failed to reject vendor",
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      {
        status: 500,
        headers: getCorsHeaders(),
      }
    )
  }
}