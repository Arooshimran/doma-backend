import type { Payload } from 'payload'

function applyCloudinaryBackgroundRemoval(imageUrl: string): string {
  if (!imageUrl.includes('res.cloudinary.com')) {
    console.warn('Image is not a Cloudinary URL — skipping background removal')
    return imageUrl
  }
  return imageUrl.replace('/upload/', '/upload/e_background_removal/')
}

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
    console.error('MODAL_3D_URL or MODAL_3D_PASSWORD missing from .env')
    return
  }

  console.log(`Triggering 3D generation for product ${productId}`)
  console.log(`   Original image: ${imageUrl}`)

  const cleanedImageUrl = applyCloudinaryBackgroundRemoval(imageUrl)
  console.log(`   Cleaned image:  ${cleanedImageUrl}`)

  // Wait for MongoDB to finish committing the document on the remote DB
  // This is necessary in production because the afterChange hook fires
  // before the document is fully readable on Render's remote MongoDB
  await new Promise(res => setTimeout(res, 3000))

  // Verify the product exists before proceeding
  let productExists = false
  for (let i = 0; i < 5; i++) {
    try {
      await payload.findByID({
        collection: 'products',
        id: productId,
        overrideAccess: true,
      })
      productExists = true
      console.log(`Product ${productId} confirmed in DB after ${i + 1} attempt(s)`)
      break
    } catch {
      console.log(`Product not readable yet, retrying... (${i + 1}/5)`)
      await new Promise(res => setTimeout(res, 2000 * (i + 1)))
    }
  }

  if (!productExists) {
    console.error(`Product ${productId} never became readable after retries — aborting`)
    return
  }

  try {
    await payload.update({
      collection: 'products',
      id: productId,
      overrideAccess: true,
      data: { model3dStatus: 'processing' },
    })

    const MAX_RETRIES = 4
    const RETRY_DELAYS_MS = [30000, 60000, 120000, 180000]
    let response: Response | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3600000)
        try {
          response = await fetch(MODAL_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image_url: cleanedImageUrl,
              product_id: productId,
              password: MODAL_PASSWORD,
            }),
            signal: controller.signal,
          })
        } finally {
          clearTimeout(timeoutId)
        }

        if (response.status === 408) {
          const text = await response.text()
          console.warn(`Modal 408 on attempt ${attempt}/${MAX_RETRIES}: ${text}`)
          if (attempt < MAX_RETRIES) {
            const delay = RETRY_DELAYS_MS[attempt - 1]
            console.log(`Retrying in ${delay / 1000}s...`)
            await new Promise(res => setTimeout(res, delay))
            response = null
            continue
          }
          throw new Error(`Modal returned 408: ${text}`)
        }

        break
      } catch (fetchErr: any) {
        if (fetchErr.message?.startsWith('Modal returned 408')) throw fetchErr
        console.warn(`Modal fetch error on attempt ${attempt}/${MAX_RETRIES}: ${fetchErr.message}`)
        if (attempt >= MAX_RETRIES) throw fetchErr
        const delay = RETRY_DELAYS_MS[attempt - 1]
        console.log(`Retrying in ${delay / 1000}s...`)
        await new Promise(res => setTimeout(res, delay))
      }
    }

    if (!response!.ok) {
      throw new Error(`Modal returned ${response!.status}: ${await response!.text()}`)
    }

    const result = await response!.json()

    if (!result.success) {
      throw new Error(result.error || 'Modal returned success: false')
    }

    await payload.update({
      collection: 'products',
      id: productId,
      overrideAccess: true,
      data: {
        model3dUrl: result.glb_url,
        model3dStatus: 'ready',
        model3dGeneratedAt: new Date().toISOString(),
      },
    })

    console.log(`3D model saved for product ${productId}: ${result.glb_url}`)

    // Trigger compression as isolated HTTP request
    fetch(`${process.env.NEXT_PUBLIC_SERVER_URL}/api/compress-3d`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId,
        glbUrl: result.glb_url,
        secret: process.env.COMPRESSION_SECRET,
      }),
    }).catch((err) => console.error('[compress] Failed to trigger compression route:', err))

  } catch (error: any) {
    console.error(`3D generation failed for product ${productId}:`, error.message)
    console.error('Fetch error cause:', error.cause)
    console.error('Fetch error name:', error.name)
    console.error('Fetch error stack:', error.stack)
    await payload.update({
      collection: 'products',
      id: productId,
      overrideAccess: true,
      data: { model3dStatus: 'failed' },
    }).catch(() => {})
  }
}