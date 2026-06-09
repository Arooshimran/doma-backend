// OpenRouter.ai — free vision models, globally accessible, no billing required.
// Sign up free at openrouter.ai → Keys → Create Key → add OPENROUTER_API_KEY to .env
// Uses meta-llama/llama-3.2-11b-vision-instruct:free (completely free, no credits needed)

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

export async function validateProductImageMatch(
  imageUrl: string,
  productTitle: string,
): Promise<{ isValid: boolean; reason: string }> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.warn("[ImageValidator] No OPENROUTER_API_KEY set – skipping validation")
    return { isValid: true, reason: "No API key configured" }
  }

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nex-agi/nex-n2-pro:free",
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl } },
              {
                type: "text",
                text: `You are a product listing validator. Does this image show a "${productTitle}"? Synonyms are fine (e.g. sofa = couch). Reply with only YES or NO.`,
              },
            ],
          },
        ],
        max_tokens: 500,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.warn("[ImageValidator] API error", res.status, errText.slice(0, 300))
      return { isValid: true, reason: "Validation service unavailable" }
    }

    const data = await res.json()
    const message = data?.choices?.[0]?.message ?? {}

    // Extract text from all possible fields (reasoning models put answer in content after thinking)
    const contentText: string = message?.content ?? ""
    const reasoningText: string = message?.reasoning ?? ""
    const reasoningDetails: string = (message?.reasoning_details ?? [])
      .map((d: any) => d?.text ?? "").join(" ")

    const combined = `${contentText} ${reasoningText} ${reasoningDetails}`.toUpperCase()
    console.log("[ImageValidator] Full message:", JSON.stringify(message))
    console.log("[ImageValidator] Response for product:", JSON.stringify(productTitle), "→", combined.slice(0, 150))

    if (combined.includes("NO") && !combined.includes("YES")) {
      return {
        isValid: false,
        reason: `Image does not match the product name "${productTitle}"`,
      }
    }

    return { isValid: true, reason: "Image matches product name" }
  } catch (err) {
    console.error("[ImageValidator] validation error:", err)
    return { isValid: true, reason: "Validation error – skipped" }
  }
}
