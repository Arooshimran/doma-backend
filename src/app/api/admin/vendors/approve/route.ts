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
    const { vendorId, adminId, approvalNote } = await request.json()


    if (!vendorId) {
      console.error("Missing vendorId")
      return NextResponse.json(
        { error: "Vendor ID is required" },
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


    if (existingVendor.status === "approved") {
      return NextResponse.json(
        { 
          success: true, 
          message: "Vendor is already approved",
          vendor: existingVendor 
        },
        { status: 200, headers }
      )
    }

    const vendor = await payload.update({
      collection: "vendors",
      id: vendorId,
      data: {
        status: "approved",
        approvalNote: approvalNote || "Approved by admin",
      },
    })


    // Send approval email using Payload's email system
    try {
      await payload.sendEmail({
        to: vendor.email,
        subject: `Your ${vendor.storeName} vendor application has been approved!`,
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
                <h1>Congratulations!</h1>
              </div>
              <div class="content">
                <h2>Your vendor application has been approved!</h2>
                <p>Dear ${vendor.storeName} team,</p>
                <p>We're excited to inform you that your vendor application has been <strong>approved</strong>!</p>
                
                <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
                  <h3>Application Details:</h3>
                  <p><strong>Store Name:</strong> ${vendor.storeName}</p>
                  <p><strong>Email:</strong> ${vendor.email}</p>
                  <p><strong>Status:</strong> <span style="color: #28a745; font-weight: bold;">APPROVED</span></p>
                  <p><strong>Approved Date:</strong> ${new Date().toLocaleDateString()}</p>
                  ${approvalNote ? `<p><strong>Admin Note:</strong> ${approvalNote}</p>` : ''}
                </div>
                <ul>
                  <li>You can now log in to your vendor dashboard</li>
                  <li>Start adding your products to the marketplace</li>
                  <li>Set up your store profile and branding</li>
                  <li>Begin receiving customer orders</li>
                </ul>

                <a href="https://doma-gray.vercel.app/login/vendor" class="button">Login to Dashboard</a>

                <p>If you have any questions, please don't hesitate to contact our support team.</p>
                <p>Welcome to the marketplace!</p>
              </div>
              <div class="footer">
                <p>This is an automated message from your marketplace platform.</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `
          Congratulations! Your vendor application has been approved!
          
          Store Name: ${vendor.storeName}
          Email: ${vendor.email}
          Status: APPROVED
          Approved Date: ${new Date().toLocaleDateString()}
          ${approvalNote ? `Admin Note: ${approvalNote}` : ''}
          
          You can now log in to your vendor dashboard and start selling!
          Login URL: https://doma-gray.vercel.app/login/vendor
          
          Welcome to the marketplace!
        `
      })

    } catch (emailError: unknown) {
      if (emailError && typeof emailError === 'object' && 'message' in emailError) {
        console.error("Failed to send approval email:", (emailError as { message: string }).message)
      } else {
        console.error("Failed to send approval email:", emailError)
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Vendor approved successfully and notification email sent",
        vendor: {
          id: vendor.id,
          email: vendor.email,
          storeName: vendor.storeName,
          status: vendor.status,
          approvalNote: vendor.approvalNote,
        },
      },
      {
        status: 200,
        headers,
      }
    )

  } catch (error: unknown) {
    console.error("=== VENDOR APPROVAL FAILED ===")
    if (error && typeof error === 'object' && 'message' in error) {
      console.error("Approval error:", {
        message: (error as { message: string }).message,
        name: (error as { name?: string }).name,
        stack: (error as { stack?: string }).stack?.split('\n').slice(0, 3)
      })
    } else {
      console.error("Approval error:", error)
    }

    return NextResponse.json(
      {
        error: "Failed to approve vendor",
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