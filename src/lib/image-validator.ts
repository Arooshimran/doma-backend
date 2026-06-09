// Hugging Face CLIP zero-shot image classification — free, no billing required.
// NOTE: api-inference.huggingface.co is DNS-blocked on Pakistani ISPs.
// This runs fine on the production Render server (US-based) — test via the deployed URL.
// Optionally add HF_TOKEN=hf_xxx to .env (free at huggingface.co/settings/tokens) for higher rate limits.
const HF_CLIP_URL =
  "https://api-inference.huggingface.co/models/openai/clip-vit-base-patch32"

export async function validateProductImageMatch(
  imageUrl: string,
  productTitle: string,
): Promise<{ isValid: boolean; reason: string }> {
  try {
    const imageRes = await fetch(imageUrl)
    if (!imageRes.ok) return { isValid: true, reason: "Could not fetch image" }

    const contentType = (imageRes.headers.get("content-type") || "image/jpeg").split(";")[0].trim()
    const supported = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if (!supported.includes(contentType)) return { isValid: true, reason: "Non-image type skipped" }

    const imageBuffer = await imageRes.arrayBuffer()
    const base64Image = Buffer.from(imageBuffer).toString("base64")

    const headers: Record<string, string> = { "Content-Type": "application/json" }
    const hfToken = process.env.HF_TOKEN
    if (hfToken) headers["Authorization"] = `Bearer ${hfToken}`

    const matchLabel = `a photo of a ${productTitle.toLowerCase()}`
    const noMatchLabel = `a photo of something that is not a ${productTitle.toLowerCase()}`

    const hfRes = await fetch(HF_CLIP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        inputs: base64Image,
        parameters: { candidate_labels: [matchLabel, noMatchLabel] },
      }),
    })

    if (hfRes.status === 503) {
      console.warn("[HF CLIP] Model loading – skipping validation this time")
      return { isValid: true, reason: "Validation service loading" }
    }

    if (!hfRes.ok) {
      const errText = await hfRes.text()
      console.warn("[HF CLIP] API error", hfRes.status, errText.slice(0, 300))
      return { isValid: true, reason: "Validation service unavailable" }
    }

    const result = await hfRes.json()
    console.log("[HF CLIP] Result for product:", JSON.stringify(productTitle), "→", JSON.stringify(result))

    if (!Array.isArray(result) || result.length === 0) {
      return { isValid: true, reason: "No result from validation" }
    }

    const topResult = result[0] as { label: string; score: number }
    if (topResult.label === noMatchLabel && topResult.score > 0.60) {
      return {
        isValid: false,
        reason: `Image does not appear to show a ${productTitle}`,
      }
    }

    return { isValid: true, reason: "Image matches product name" }
  } catch (err) {
    console.error("[HF CLIP] validation error:", err)
    return { isValid: true, reason: "Validation error – skipped" }
  }
}
