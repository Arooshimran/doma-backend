import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client" // Use your custom helper
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import { OAuth2Client } from 'google-auth-library'
import { randomBytes } from 'crypto'

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

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
  try {
    console.log("🔐 Google Login - Request received")
    const body = await request.json()
    const { idToken } = body

    if (!idToken) {
      return NextResponse.json(
        { error: "idToken is required" },
        { status: 400, headers: corsHeaders(request) }
      )
    }

    // 1. Verify Google Token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const googlePayload = ticket.getPayload()
    
    if (!googlePayload || !googlePayload.email) {
      return NextResponse.json(
        { error: "Invalid Google Token" },
        { status: 401, headers: corsHeaders(request) }
      )
    }

    const { email, name, sub: googleId } = googlePayload
    const payload = await getPayloadClient() // Matches your working route

    // 2. Find or Create Customer
    const customerSearch = await payload.find({
      collection: 'customers',
      where: { email: { equals: email } },
    })

    let userDoc = customerSearch.docs[0]

    if (!userDoc) {
      console.log("🆕 Creating new Google customer:", email)
      userDoc = await payload.create({
        collection: 'customers',
        data: {
          email,
          Name: name || 'Google User',
          googleId,
          password: randomBytes(32).toString('hex'),
          status: 'active',
        },
      })
    }

    // 3. Generate JWT via Payload Login
    const loginResult = await payload.login({
      collection: "customers",
      data: { 
        email: userDoc.email, 
        password: 'SOCIAL_LOGIN_BYPASS' // Bypassed by overrideAccess
      },
      overrideAccess: true,
    })

    console.log("✅ Google Login - Success for:", email)

    return NextResponse.json(
      {
        success: true,
        token: loginResult.token,
        user: {
          id: userDoc.id,
          email: userDoc.email,
          Name: (userDoc as any).Name,
          status: userDoc.status,
          role: "customer",
        },
      },
      { headers: corsHeaders(request) }
    )

  } catch (error) {
    console.error("Google login error:", error)
    return NextResponse.json(
      { 
        error: "Google authentication failed",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500, headers: corsHeaders(request) }
    )
  }
}