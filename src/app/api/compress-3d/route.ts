import { type NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import configPromise from '@payload-config'
import { createClient } from '@supabase/supabase-js'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune } from '@gltf-transform/functions'
import sharp from 'sharp'

export async function POST(req: NextRequest) {
  const { productId, glbUrl, secret } = await req.json()

  if (secret !== process.env.COMPRESSION_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await getPayload({ config: configPromise })

  try {
    console.log(`[compress] Starting for ${productId}`)

    const glbResponse = await fetch(glbUrl)
    if (!glbResponse.ok) throw new Error(`Failed to download GLB: ${glbResponse.status}`)

    const rawBuffer = Buffer.from(await glbResponse.arrayBuffer())
    const rawMB = (rawBuffer.length / 1024 / 1024).toFixed(2)
    console.log(`[compress] Downloaded ${rawMB}MB`)

    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    const document = await io.readBinary(new Uint8Array(rawBuffer))

    await document.transform(dedup(), prune())

    const MAX_SIZE = 1024
    const textures = document.getRoot().listTextures()
    console.log(`[compress] Found ${textures.length} texture(s)`)

    for (let i = 0; i < textures.length; i++) {
      const texture = textures[i]
      const imageData = texture.getImage()
      if (!imageData) continue
      try {
        const buf = Buffer.from(imageData)
        const meta = await sharp(buf).metadata()
        const w = meta.width ?? 0
        const h = meta.height ?? 0
        if (w > MAX_SIZE || h > MAX_SIZE) {
          const resized = await sharp(buf)
            .resize(MAX_SIZE, MAX_SIZE, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer()
          texture.setImage(new Uint8Array(resized))
          texture.setMimeType('image/jpeg')
          console.log(`[compress] Texture ${i + 1}: ${w}x${h} → ≤${MAX_SIZE}x${MAX_SIZE}`)
        }
      } catch (texErr: any) {
        console.warn(`[compress] Texture ${i + 1} skipped: ${texErr.message}`)
      }
    }

    const compressedArray = await io.writeBinary(document)
    const compressedBuffer = Buffer.from(compressedArray)
    const compressedMB = (compressedBuffer.length / 1024 / 1024).toFixed(2)
    console.log(`[compress] ${rawMB}MB → ${compressedMB}MB (saved ${((1 - compressedBuffer.length / rawBuffer.length) * 100).toFixed(1)}%)`)

    // Upload compressed GLB to Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    )

    const filename = `model_${productId}_opt.glb`
    console.log(`[compress] Uploading to Supabase as ${filename}...`)

    const { error: uploadError } = await supabase.storage
      .from('furniture-3d-models')
      .upload(filename, compressedBuffer, {
        contentType: 'model/gltf-binary',
        upsert: true,
      })

    if (uploadError) throw new Error(`Supabase upload failed: ${uploadError.message}`)

    const { data: { publicUrl } } = supabase.storage
      .from('furniture-3d-models')
      .getPublicUrl(filename)

    console.log(`[compress] Supabase upload complete → ${publicUrl}`)

    await payload.update({
      collection: 'products',
      id: productId,
      data: { model3dUrl: publicUrl },
    })

    console.log(`[compress] Done for ${productId} → ${publicUrl}`)
    return NextResponse.json({ success: true, url: publicUrl })

  } catch (err: any) {
    console.error(`[compress] Failed: ${err.message}`)
    console.error(`[compress] Stack: ${err.stack}`)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}