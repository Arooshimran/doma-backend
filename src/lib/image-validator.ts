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

    // Use only content for the decision — reasoning text often contains "YES/NO" which breaks matching
    const answer: string = (message?.content ?? "").trim().toUpperCase()
    console.log("[ImageValidator] Full message:", JSON.stringify(message))
    console.log("[ImageValidator] Response for product:", JSON.stringify(productTitle), "→", answer)

    if (!answer) {
      // Model returned no content — skip validation
      return { isValid: true, reason: "No answer from model" }
    }

    if (answer.startsWith("NO")) {
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
