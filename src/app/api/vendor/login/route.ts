import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"

// CORS headers helper
const getCorsHeaders = () => ({
  "Access-Control-Allow-Origin": "http://localhost:3001",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Credentials": "true",
})

// ✅ Handle preflight OPTIONS request
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(),
  })
}

export async function POST(request: NextRequest) {
  console.log("🚀 Processing vendor login request...")

  try {
    // Parse request body
    const body = await request.json()
    const { email, password } = body

    console.log("📧 Login attempt for email:", email)

    if (!email || !password) {
      console.error("❌ Missing email or password")
      return NextResponse.json(
        { error: "Email and password are required" },
        {
          status: 400,
          headers: getCorsHeaders(),
        }
      )
    }

    // Get Payload client
    console.log("🔄 Getting Payload client...")
    const payload = await getPayloadClient()
    console.log("✅ Payload client obtained")

    // First, let's check if the vendor exists
    console.log("🔍 Checking if vendor exists in database...")
    try {
      const existingVendor = await payload.find({
        collection: "vendors",
        where: {
          email: {
            equals: email,
          },
        },
      })

      if (existingVendor.docs.length === 0) {
        console.error("❌ No vendor found with email:", email)
        return NextResponse.json(
          { error: "No vendor account found with this email address. Please register first." },
          {
            status: 401,
            headers: getCorsHeaders(),
          }
        )
      }

      const vendor = existingVendor.docs[0]
      console.log("✅ Vendor found:", {
        id: vendor.id,
        email: vendor.email,
        storeName: vendor.storeName,
        status: vendor.status,
        hasPassword: !!vendor.password
      })

      // Check vendor status before attempting login
      if (vendor.status === "pending") {
        console.log("⏳ Vendor status: pending")
        return NextResponse.json(
          {
            error: "Account pending approval",
            status: "pending",
            message: "Your vendor account is being reviewed.",
          },
          {
            status: 403,
            headers: getCorsHeaders(),
          }
        )
      }

      if (vendor.status === "rejected") {
        console.log("❌ Vendor status: rejected")
        return NextResponse.json(
          {
            error: "Account rejected",
            status: "rejected",
            message: "Vendor application was rejected.",
          },
          {
            status: 403,
            headers: getCorsHeaders(),
          }
        )
      }

    } catch (findError: any) {
      console.error("❌ Error checking vendor existence:", findError.message)
      return NextResponse.json(
        { error: "Database error while checking vendor" },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      )
    }

    // Attempt login
    console.log("🔐 Attempting login with Payload...")
    const result = await payload.login({
      collection: "vendors",
      data: { email, password },
    })

    console.log("✅ Login successful, user authenticated")

    // Check user status
    if (result?.user?.status === "pending") {
      console.log("⏳ User status: pending")
      return NextResponse.json(
        {
          error: "Account pending approval",
          status: "pending",
          message: "Your vendor account is being reviewed.",
        },
        {
          status: 403,
          headers: getCorsHeaders(),
        }
      )
    }

    if (result?.user?.status === "rejected") {
      console.log("❌ User status: rejected")
      return NextResponse.json(
        {
          error: "Account rejected",
          status: "rejected",
          message: "Vendor application was rejected.",
        },
        {
          status: 403,
          headers: getCorsHeaders(),
        }
      )
    }

    console.log("✅ Login successful, user status approved")

    // Return success response
    return NextResponse.json(
      {
        success: true,
        token: result.token,
        user: {
          id: result.user.id,
          email: result.user.email,
          storeName: result.user.storeName,
          status: result.user.status,
        },
      },
      {
        status: 200,
        headers: getCorsHeaders(),
      }
    )
  } catch (err: any) {
    console.error("❌ Vendor login error:", {
      message: err.message,
      stack: err.stack,
      name: err.name
    })

    // Handle specific Payload errors
    if (err.message?.includes('Invalid login credentials') || 
        err.message?.includes('email or password provided is incorrect')) {
      console.log("🔑 Authentication failed - incorrect credentials")
      return NextResponse.json(
        { 
          error: "Invalid email or password",
          hint: "Please check your email and password are correct"
        },
        {
          status: 401,
          headers: getCorsHeaders(),
        }
      )
    }

    if (err.message?.includes('Cannot overwrite')) {
      console.error("🔄 Model overwrite error detected - this is a Payload configuration issue")
      return NextResponse.json(
        { error: "Server configuration error. Please restart the backend server." },
        {
          status: 500,
          headers: getCorsHeaders(),
        }
      )
    }

    // Generic server error
    return NextResponse.json(
      { 
        error: "Login failed", 
        details: process.env.NODE_ENV === 'development' ? err.message : undefined 
      },
      {
        status: 500,
        headers: getCorsHeaders(),
      }
    )
  }
}