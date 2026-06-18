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

const deriveGooglePassword = (googleId: string) =>
  createHmac('sha256', process.env.PAYLOAD_SECRET!)
    .update(googleId)
    .digest('hex')

export async function POST(request: NextRequest) {
  try {
    console.log("Google Login - Request received")
    const body = await request.json()
    const { idToken } = body

    if (!idToken) {
      return NextResponse.json(
        { error: "idToken is required" },
        { status: 400, headers: corsHeaders(request) }
      )
    }

    const audience = [
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_ANDROID_CLIENT_ID,
      process.env.GOOGLE_IOS_CLIENT_ID,
    ].filter(Boolean) as string[]

    const ticket = await client.verifyIdToken({
      idToken,
      audience,
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

    const customerSearch = await payload.find({
      collection: 'customers',
      where: { email: { equals: email } },
    })

    let userDoc = customerSearch.docs[0]
    const googlePassword = deriveGooglePassword(googleId)

    if (!userDoc) {
      userDoc = await payload.create({
        collection: 'customers',
        data: {
          email,
          Name: name || 'Google User',
          googleId,
          password: googlePassword,
          status: 'active',
        },
      })
      console.log("New Google customer created:", email)
    } else {
      await payload.update({
        collection: 'customers',
        id: userDoc.id,
        data: {
          password: googlePassword,
          googleId,
        },
      })
      console.log("Existing user updated:", email)
    }

    try {
      await payload.create({
        collection: 'carts',
        data: { customer: userDoc.id, items: [] },
      })
      console.log("Cart created for:", email)
    } catch {
      console.log("Cart already exists for:", email)
    }

    try {
      await payload.create({
        collection: 'wishlists',
        data: { customer: userDoc.id, products: [] },
      })
      console.log("Wishlist created for:", email)
    } catch {
      console.log("Wishlist already exists for:", email)
    }

    const loginResult = await payload.login({
      collection: 'customers',
      data: {
        email,
        password: googlePassword,
      },
    })

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
        },
      },
      { headers: corsHeaders(request) }
    )

  } catch (error) {
    console.error("Google login error:", error)
    return NextResponse.json(
      {
        error: "Google authentication failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers: corsHeaders(request) }
    )
  }
}