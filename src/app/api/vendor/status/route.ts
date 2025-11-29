import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  })

// Handle preflight OPTIONS request
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

export async function GET(request: NextRequest) {
  console.log("Processing vendor status check request...")

  try {
    // Get vendor email from query params
    const { searchParams } = new URL(request.url)
    const email = searchParams.get("email")

    console.log("Status check for email:", email)

    if (!email) {
      console.error("Missing email parameter")
      return NextResponse.json(
        { error: "Email parameter is required" },
        {
          status: 400,
          headers: corsHeaders(request),
        }
      )
    }

    // Get Payload client
    console.log("Getting Payload client...")
    const payload = await getPayloadClient()
    console.log("Payload client obtained")

    // Check if the vendor exists
    console.log("Checking vendor status in database...")
    try {
      const vendors = await payload.find({
        collection: "vendors",
        where: {
          email: {
            equals: email,
          },
        },
      })

      if (vendors.docs.length === 0) {
        console.error("No vendor found with email:", email)
        return NextResponse.json(
          { error: "No vendor account found with this email address" },
          {
            status: 404,
            headers: corsHeaders(request),
          }
        )
      }

      const vendor = vendors.docs[0]
      console.log("Vendor found:", {
        id: vendor.id,
        email: vendor.email,
        storeName: vendor.storeName,
        status: vendor.status,
      })

      // Return vendor status information
      return NextResponse.json(
        {
          success: true,
          vendor: {
            id: vendor.id,
            email: vendor.email,
            storeName: vendor.storeName,
            status: vendor.status,
            approvalNote: vendor.approvalNote,
            rejectionReason: vendor.rejectionReason,
          },
        },
        {
          status: 200,
          headers: corsHeaders(request),
        }
      )

    } catch (findError: any) {
      console.error("Error checking vendor status:", findError.message)
      return NextResponse.json(
        { error: "Database error while checking vendor status" },
        {
          status: 500,
          headers: corsHeaders(request),
        }
      )
    }

  } catch (err: any) {
    console.error("Vendor status check error:", {
      message: err.message,
      stack: err.stack,
      name: err.name
    })

    if (err.message?.includes('Cannot overwrite')) {
      console.error("Model overwrite error detected - this is a Payload configuration issue")
      return NextResponse.json(
        { error: "Server configuration error. Please restart the backend server." },
        {
          status: 500,
          headers: corsHeaders(request),
        }
      )
    }

    // Generic server error
    return NextResponse.json(
      { 
        error: "Failed to check vendor status", 
        details: process.env.NODE_ENV === 'development' ? err.message : undefined 
      },
      {
        status: 500,
        headers: corsHeaders(request),
      }
    )
  }
}