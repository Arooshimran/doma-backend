import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const payload = await getPayload({ config })
    const body = await req.json()
    const { orderId } = params

    // Get token from Authorization header
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.replace('JWT ', '')

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify the user via token
    const { user } = await payload.auth({
      headers: req.headers,
    })

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Update the order
    const updatedOrder = await payload.update({
      collection: 'orders',
      id: orderId,
      data: body,
      overrideAccess: false,
      user,
    })

    return NextResponse.json(updatedOrder, { status: 200 })
  } catch (error: any) {
    console.error('Error updating order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to update order' },
      { status: 500 }
    )
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { orderId: string } }
) {
  try {
    const payload = await getPayload({ config })
    const { orderId } = params

    const { user } = await payload.auth({
      headers: req.headers,
    })

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const order = await payload.findByID({
      collection: 'orders',
      id: orderId,
      overrideAccess: false,
      user,
    })

    return NextResponse.json(order, { status: 200 })
  } catch (error: any) {
    console.error('Error fetching order:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch order' },
      { status: 500 }
    )
  }
}