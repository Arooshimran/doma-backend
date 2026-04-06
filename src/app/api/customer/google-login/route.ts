import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config' // Matches your import style
import { OAuth2Client } from 'google-auth-library'
import crypto from 'crypto'

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

export async function POST(req: Request) {
  try {
    const payload = await getPayload({ config })
    const { idToken } = await req.json()

    // 1. Verify Google Token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const googlePayload = ticket.getPayload()
    
    if (!googlePayload || !googlePayload.email) {
      return NextResponse.json({ error: "Invalid Token" }, { status: 401 })
    }

    const { email, name, sub: googleId } = googlePayload

    // 2. Find or Create Customer in the 'customers' collection
    let customer = await payload.find({
      collection: 'customers',
      where: { email: { equals: email } },
    })

    let userDoc = customer.docs[0]

    if (!userDoc) {
      userDoc = await payload.create({
        collection: 'customers',
        data: {
          email,
          Name: name || 'Google User',
          googleId,
          password: crypto.randomBytes(32).toString('hex'),
          status: 'active',
        },
      })
    }

    // 3. Generate Payload JWT
    const result = await payload.login({
      collection: 'customers',
      data: { 
        email: userDoc.email, 
        password: 'SOCIAL_LOGIN_BYPASS' // overrideAccess handles this
      },
      overrideAccess: true,
    })

    return NextResponse.json({
      success: true,
      token: result.token,
      user: {
        id: userDoc.id,
        email: userDoc.email,
        Name: (userDoc as any).Name,
      },
    })

  } catch (err: any) {
    console.error("Google Auth Error:", err.message)
    return NextResponse.json({ error: "Authentication failed" }, { status: 401 })
  }
}