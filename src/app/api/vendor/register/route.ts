import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  })

export async function OPTIONS(request: NextRequest) {
  console.log("Handling OPTIONS preflight request for registration")
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

export async function POST(request: NextRequest) {
  console.log("\n=== VENDOR REGISTRATION ATTEMPT STARTED ===")

  try {
    console.log("Parsing registration data...")
    const vendorData = await request.json()
    
    console.log("Registration request details:", {
      email: vendorData.email,
      storeName: vendorData.storeName,
      hasPassword: !!vendorData.password,
      hasContactInfo: !!vendorData.contactInfo,
      hasBusinessInfo: !!vendorData.businessInfo,
    })

    // Validate required fields
    if (!vendorData.email || !vendorData.password || !vendorData.storeName) {
      console.error("Missing required fields")
      return NextResponse.json(
        { 
          error: "Missing required fields",
          required: ["email", "password", "storeName"],
          received: Object.keys(vendorData)
        },
        { status: 400, headers: corsHeaders(request) }
      )
    }

    console.log("Getting Payload client...")
    const payload = await getPayloadClient()
    console.log("Payload client obtained")

    // Check if vendor already exists
    console.log("Checking if vendor already exists...")
    try {
      const existingVendor = await payload.find({
        collection: "vendors",
        where: {
          email: {
            equals: vendorData.email,
          },
        },
      })

      if (existingVendor.docs.length > 0) {
        console.log("Vendor already exists with this email")
        return NextResponse.json(
          { 
            error: "Email already registered",
            message: "A vendor account with this email address already exists. Please use a different email or try logging in."
          },
          { status: 409, headers: corsHeaders(request) }
        )
      }

      console.log("Email is available")
    } catch (findError: any) {
      console.error("Error checking existing vendor:", findError.message)
      return NextResponse.json(
        { error: "Database error while checking existing vendor" },
        { status: 500, headers: corsHeaders(request) }
      )
    }

    const vendorPayload = {
      ...vendorData,
      status: "pending", 
      role: "vendor",    
      slug: vendorData.storeName
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') 
        .replace(/\s+/g, '-')         
        .replace(/-+/g, '-')          
        .trim(),
    }

    console.log("Prepared vendor data:", {
      email: vendorPayload.email,
      storeName: vendorPayload.storeName,
      slug: vendorPayload.slug,
      status: vendorPayload.status,
      role: vendorPayload.role
    })

    console.log("Creating new vendor...")
    const startTime = Date.now()
    
    const vendor = await payload.create({
      collection: "vendors",
      data: vendorPayload,
    })
    
    const endTime = Date.now()
    console.log(`Vendor created successfully in ${endTime - startTime}ms:`, {
      id: vendor.id,
      email: vendor.email,
      storeName: vendor.storeName,
      status: vendor.status
    })

    console.log("=== VENDOR REGISTRATION COMPLETED SUCCESSFULLY ===\n")

    return NextResponse.json(
      {
        success: true,
        message: "Registration successful! Your application is being reviewed.",
        vendor: {
          id: vendor.id,
          email: vendor.email,
          storeName: vendor.storeName,
          slug: vendor.slug,
          status: vendor.status,
          role: vendor.role,
        },
      },
      {
        status: 201,
        headers: corsHeaders(request),
      }
    )

  } catch (error: any) {
    console.error("=== VENDOR REGISTRATION FAILED ===")
    console.error("Registration error details:", {
      message: error.message,
      name: error.name,
      code: error.code,
      stack: error.stack?.split('\n').slice(0, 3)
    })

    let errorMessage = "Registration failed"
    let statusCode = 500
    let errorDetails: any = undefined

    if (error.message?.includes('duplicate') || 
        error.message?.includes('E11000') || 
        error.code === 11000) {
      errorMessage = "Email already registered"
      statusCode = 409
      console.log("Duplicate email error detected")
    }
    else if (error.message?.includes('validation') || 
             error.name === 'ValidationError') {
      errorMessage = "Validation error"
      statusCode = 400
      errorDetails = {
        validationErrors: error.details || error.errors || "Invalid data provided"
      }
      console.log("Validation error detected")
    }
    else if (error.message?.includes('required') || 
             error.message?.includes('Path `') && error.message?.includes('` is required')) {
      errorMessage = "Missing required fields"
      statusCode = 400
      console.log("Required field error detected")
    }
    else if (error.message?.includes('Cannot overwrite')) {
      errorMessage = "Server restart required. Please restart your backend server."
      console.log("SOLUTION: Restart your Next.js development server")
    }
    else if (error.message?.includes('connection') || 
             error.message?.includes('ECONNREFUSED')) {
      errorMessage = "Database connection error"
      console.log("SOLUTION: Check your database connection")
    }

    console.log("=== END REGISTRATION ERROR ===\n")

    return NextResponse.json(
      { 
        error: errorMessage,
        message: `Registration failed: ${errorMessage}`,
        details: process.env.NODE_ENV === 'development' ? {
          originalError: error.message,
          errorCode: error.code,
          ...errorDetails
        } : undefined
      },
      {
        status: statusCode,
        headers: corsHeaders(request),
      }
    )
  }
}