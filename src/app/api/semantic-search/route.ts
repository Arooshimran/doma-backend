import { NextRequest, NextResponse } from 'next/server'
import { getPayloadClient } from '@/lib/payload-client'
import { embedText } from '@/lib/embeddings'
import { querySimilar } from '@/lib/qdrant'

export async function POST(req: NextRequest) {
  try {
    const { query, topK = 10, filters = {} } = await req.json()
    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'query is required' }, { status: 400 })
    }

    const vector = await embedText(query)
    if (!vector.length) return NextResponse.json({ results: [] })

    const qres = await querySimilar(vector, Math.min(topK, 50), filters)
    const ids = qres.map((p: any) => String(p.id))

    const payload = await getPayloadClient()
    const products = ids.length
      ? await payload.find({ collection: 'products', where: { id: { in: ids } }, limit: ids.length })
      : { docs: [] }

    const byId = new Map(products.docs.map((d: any) => [String(d.id), d]))
    const results = qres.map((p: any) => ({
      id: String(p.id),
      score: p.score,
      product: byId.get(String(p.id)) ?? null,
    }))

    return NextResponse.json({ results })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'search failed' }, { status: 500 })
  }
}



