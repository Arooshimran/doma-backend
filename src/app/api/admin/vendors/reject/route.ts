import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  })

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)
  
  try {
    const payload = await getPayloadClient()
    const { vendorId, adminId, rejectionReason } = await request.json()


    if (!vendorId) {
      console.error("Missing vendorId")
      return NextResponse.json(
        { error: "Vendor ID is required" },
        { status: 400, headers }
      )
    }

    if (!rejectionReason) {
      console.error("Missing rejection reason")
      return NextResponse.json(
        { error: "Rejection reason is required" },
        { status: 400, headers }
      )
    }
    const existingVendor = await payload.findByID({
      collection: "vendors",
      id: vendorId,
    })

    if (!existingVendor) {
      console.error("Vendor not found")
      return NextResponse.json(
        { error: "Vendor not found" },
        { status: 404, headers }
      )
    }


    if (existingVendor.status === "rejected") {
      return NextResponse.json(
        { 
          success: true, 
          message: "Vendor is already rejected",
          vendor: existingVendor 
        },
        { status: 200, headers }
      )
    }

    const vendor = await payload.update({
      collection: "vendors",
      id: vendorId,
      data: {
        status: "rejected",
        rejectionReason: rejectionReason,
      },
    })

    // Send rejection email using Payload's email system
    console.log("Sending rejection email...")
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
                <h1>Application Update</h1>
              </div>
              <div class="content">
                <h2>Update on your vendor application</h2>
                <p>Dear ${vendor.storeName} team,</p>
                <p>Thank you for your interest in joining our marketplace. After careful review, we are unable to approve your vendor application at this time.</p>
                
                <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
                  <h3>Application Details:</h3>
                  <p><strong>Store Name:</strong> ${vendor.storeName}</p>
                  <p><strong>Email:</strong> ${vendor.email}</p>
                  <p><strong>Status:</strong> <span style="color: #dc3545; font-weight: bold;">NOT APPROVED</span></p>
                  <p><strong>Review Date:</strong> ${new Date().toLocaleDateString()}</p>
                </div>

                <div class="reason-box">
                  <h3>Reason for Decision:</h3>
                  <p>${rejectionReason}</p>
                </div>

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

      console.log("Rejection email sent successfully")
    } catch (emailError: unknown) {
      if (emailError && typeof emailError === 'object' && 'message' in emailError) {
        console.error("Failed to send rejection email:", (emailError as { message: string }).message)
      } else {
        console.error("Failed to send rejection email:", emailError)
      }
      console.log("Continuing despite email failure...")
    }


    return NextResponse.json(
      {
        success: true,
        message: "Vendor rejected and notification email sent",
        vendor: {
          id: vendor.id,
          email: vendor.email,
          storeName: vendor.storeName,
          status: vendor.status,
          rejectionReason: vendor.rejectionReason,
        },
      },
      {
        status: 200,
        headers,
      }
    )

  } catch (error: unknown) {
    console.error("=== VENDOR REJECTION FAILED ===")
    if (error && typeof error === 'object' && 'message' in error) {
      console.error("Rejection error:", {
        message: (error as { message: string }).message,
        name: (error as { name?: string }).name,
        stack: (error as { stack?: string }).stack?.split('\n').slice(0, 3)
      })
    } else {
      console.error("Rejection error:", error)
    }

    return NextResponse.json(
      {
        error: "Failed to reject vendor",
        details:
          process.env.NODE_ENV === 'development' &&
          error && typeof error === 'object' && 'message' in error
            ? (error as { message: string }).message
            : undefined
      },
      {
        status: 500,
        headers,
      }
    )
  }
}