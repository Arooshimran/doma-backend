import type { Payload } from 'payload'

export async function generate3DModel({
  productId,
  imageUrl,
  payload,
}: {
  productId: string
  imageUrl: string
  payload: Payload
}) {
  const MODAL_URL = process.env.MODAL_3D_URL
  const MODAL_PASSWORD = process.env.MODAL_3D_PASSWORD

  if (!MODAL_URL || !MODAL_PASSWORD) {
    console.error('❌ MODAL_3D_URL or MODAL_3D_PASSWORD missing from .env')
    return
  }

  console.log(`🚀 Triggering 3D generation for product ${productId}`)
  console.log(`   Image: ${imageUrl}`)

  try {
    await payload.update({
      collection: 'products',
      id: productId,
      data: { model3dStatus: 'processing' },
    })

    const response = await fetch(MODAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        product_id: productId,
        password: MODAL_PASSWORD,
      }),
      signal: AbortSignal.timeout(3600000), // 1 hour
    })

    if (!response.ok) {
      throw new Error(`Modal returned ${response.status}: ${await response.text()}`)
    }

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error || 'Modal returned success: false')
    }

    await payload.update({
      collection: 'products',
      id: productId,
      data: {
        model3dUrl: result.glb_url,
        model3dStatus: 'ready',
        model3dGeneratedAt: new Date().toISOString(),
      },
    })

    console.log(`✅ 3D model saved for product ${productId}: ${result.glb_url}`)
  } catch (error: any) {
    console.error(`❌ 3D generation failed for product ${productId}:`, error.message)
    await payload.update({
      collection: 'products',
      id: productId,
      data: { model3dStatus: 'failed' },
    }).catch(() => {})
  }
}