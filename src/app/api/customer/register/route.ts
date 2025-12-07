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

// POST - Customer Registration
export async function POST(request: NextRequest) {
  try {
    
    const body = await request.json()
    const { email, password, Name, phone } = body

    if (!email || !password || !Name) {
      return NextResponse.json(
        { error: "Email, password, and Name are required" },
        {
          status: 400,
          headers: corsHeaders(request),
        }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "Please provide a valid email address" },
        {
          status: 400,
          headers: corsHeaders(request),
        }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters long" },
        {
          status: 400,
          headers: corsHeaders(request),
        }
      )
    }

    const payload = await getPayloadClient()
    
    const existingCustomers = await payload.find({
      collection: "customers",
      where: {
        email: {
          equals: email,
        },
      },
    })

    if (existingCustomers.docs.length > 0) {
      return NextResponse.json(
        { error: "A customer with this email already exists" },
        {
          status: 409,
          headers: corsHeaders(request),
        }
      )
    }

    const newCustomer = await payload.create({
      collection: "customers",
      data: {
        email,
        password,
        Name,
        ...(phone && { phone }),
      },
    })

    try {
      await payload.create({
        collection: "carts",
        data: {
          userId: newCustomer.id,
          items: [],
        },
      })
    } catch (cartError) {
      console.error("Failed to create cart for new customer:", cartError)
    }

    try {
      await payload.create({
        collection: "wishlists",
        data: {
          customer: newCustomer.id,
          products: [],
        },
      })
    } catch (wishlistError) {
      console.error("Failed to create wishlist for new customer:", wishlistError)
    }

    // Automatically log in the new customer after registration
    const loginResult = await payload.login({
      collection: "customers",
      data: {
        email,
        password,
      },
    })

    return NextResponse.json(
      {
        success: true,
        message: "Registration successful",
        token: loginResult.token,
        user: {
          id: newCustomer.id,
          email: newCustomer.email,
          Name: newCustomer.Name,
          phone: newCustomer.phone,
        }
      },
      {
        status: 201,
        headers: corsHeaders(request),
      }
    )
    
  } catch (error) {
    console.error("Customer registration error:", error)
    
    return NextResponse.json(
      { 
        error: "Registration failed",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      {
        status: 500,
        headers: corsHeaders(request),
      }
    )
  }
}