import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"

const corsHeaders = (request?: NextRequest) =>
  buildCorsHeadersFromRequest(request, {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  })

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request),
  })
}

// POST - Customer Login
export async function POST(request: NextRequest) {
  try {
    console.log("Customer Login - Request received")
    const body = await request.json()
    const { email, password } = body
    console.log("Customer Login - Email:", email)

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        {
          status: 400,
          headers: corsHeaders(request),
        }
      )
    }

    const payload = await getPayloadClient()
    
    const loginResult = await payload.login({
      collection: "customers", 
      data: {
        email,
        password,
      },
    })
    console.log("Customer Login - Success for:", email)

    return NextResponse.json(
      {
        success: true,
        message: "Login successful",
        token: loginResult.token, 
        user: {
          id: loginResult.user.id,
          email: loginResult.user.email,
          Name: loginResult.user.Name, 
          phone: loginResult.user.phone,
          status: loginResult.user.status,
          role: "customer",
        }
      },
      {
        headers: corsHeaders(request),
      }
    )
    
  } catch (error) {
    console.error("Customer login error:", error)
    
    if (error instanceof Error) {
      if (error.message.includes("Invalid login credentials")) {
        return NextResponse.json(
          { error: "Invalid email or password" },
        {
          status: 401,
          headers: corsHeaders(request),
        }
        )
      }
    }
    
    return NextResponse.json(
      { 
        error: "Login failed",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      {
        status: 500,
        headers: corsHeaders(request),
      }
    )
  }
}