import { type NextRequest, NextResponse } from "next/server"
import { getPayloadClient } from "@/lib/payload-client"
import { buildCorsHeadersFromRequest } from "@/lib/cors-helpers"
import { OAuth2Client } from 'google-auth-library'
import { createHmac } from 'crypto'

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

// Derives a deterministic password from googleId + PAYLOAD_SECRET
const deriveGooglePassword = (googleId: string) =>
  createHmac('sha256', process.env.PAYLOAD_SECRET!)
    .update(googleId)
    .digest('hex')

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

    // 1. Verify the ID Token with Google
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
    const payload = await getPayloadClient()

    // 2. Find or Create Customer
    const customerSearch = await payload.find({
      collection: 'customers',
      where: { email: { equals: email } },
    })

    let userDoc = customerSearch.docs[0]
    const googlePassword = deriveGooglePassword(googleId)

    if (!userDoc) {
      console.log("🆕 Creating new Google customer:", email)
      userDoc = await payload.create({
        collection: 'customers',
        data: {
          email,
          Name: name || 'Google User',
          googleId,
          password: googlePassword, // ✅ deterministic, not random
          status: 'active',
        },
      })

      // ✅ Create cart and wishlist for new Google user
      await payload.create({
        collection: 'carts',
        data: { userId: userDoc.id, items: [] },
      })
      await payload.create({
        collection: 'wishlist',
        data: { userId: userDoc.id, items: [] },
      })

      console.log("🛒 Cart & wishlist created for:", email)
    } else {
      // ✅ Existing Google user — update their password to the deterministic one
      // This fixes existing users who had a random password
      await payload.update({
        collection: 'customers',
        id: userDoc.id,
        data: { 
          password: googlePassword,
          googleId, // ✅ saves googleId if they didn't have one
        },
      })
      console.log("✅ Existing user updated:", email)
    }

    // 3. ✅ Use Payload's own login to get a fully valid token
    const loginResult = await payload.login({
      collection: 'customers',
      data: {
        email,
        password: googlePassword,
      },
    })

    console.log("✅ Google Login - Success for:", email)

    return NextResponse.json(
      {
        success: true,
        message: "Login successful",
        token: loginResult.token,
        user: {
          id: userDoc.id,
          email: userDoc.email,
          Name: (userDoc as any).Name,
          status: userDoc.status,
          role: "customer",
        }
      },
      { headers: corsHeaders(request) }
    )

  } catch (error) {
    console.error("❌ Google login error:", error)
    return NextResponse.json(
      {
        error: "Google authentication failed",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500, headers: corsHeaders(request) }
    )
  }
}