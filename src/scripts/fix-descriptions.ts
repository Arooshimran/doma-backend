/**
 * Doma Backend — Fix Descriptions for Lamps, Mirrors & Tables
 *
 * Updates descriptions for already-seeded products in bedroom and living-room
 * categories, replacing the "— from Anthropologie" / "— modern design from Article"
 * placeholder text with proper descriptions based on product type.
 *
 * Usage:
 *   npm run fix-descriptions
 *
 * Add to package.json scripts:
 *   "fix-descriptions": "tsx --env-file=.env src/scripts/fix-descriptions-lamps.ts"
 *
 * Env vars (optional):
 *   TARGET_CATEGORIES — comma-separated slugs (default: "bedroom,living-room")
 */
import dotenv from "dotenv"
import * as path from "path"
dotenv.config({ path: path.resolve(process.cwd(), ".env") })

import payload from "payload"
import config from "@payload-config"

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_CATEGORY_SLUGS = (process.env.TARGET_CATEGORIES || "bedroom,living-room")
  .split(",")
  .map((s) => s.trim().toLowerCase())

// ─────────────────────────────────────────────────────────────────────────────
// DESCRIPTION GENERATOR
// Builds a clean description based on the product title keywords
// ─────────────────────────────────────────────────────────────────────────────

function buildDescription(title: string): string {
  const t = title.toLowerCase()

  // Extract material/style hints from title
  const materials: string[] = []
  if (t.includes("velvet")) materials.push("velvet")
  if (t.includes("wood") || t.includes("wooden")) materials.push("wood")
  if (t.includes("glass")) materials.push("glass")
  if (t.includes("marble")) materials.push("marble")
  if (t.includes("seagrass")) materials.push("seagrass")
  if (t.includes("walnut")) materials.push("walnut")
  if (t.includes("oak")) materials.push("oak")
  if (t.includes("fabric") || t.includes("upholstered")) materials.push("fabric")

  const materialStr = materials.length > 0 ? `${materials.join(" and ")} ` : ""

  if (t.includes("table lamp")) {
    return `A beautifully crafted ${materialStr}table lamp that brings warm, ambient lighting to your bedroom or living space. Designed to complement modern and contemporary interiors with understated elegance.`
  }

  if (t.includes("floor lamp")) {
    return `A striking ${materialStr}floor lamp that makes a bold statement in any living room. Built for both function and style, it casts a warm, inviting glow that transforms the atmosphere of your space.`
  }

  if (t.includes("floor mirror")) {
    return `A full-length ${materialStr}floor mirror that adds depth, light, and sophistication to any room. Perfect for bedrooms and dressing areas, it combines practicality with refined aesthetic appeal.`
  }

  if (t.includes("wall mirror")) {
    return `A sleek ${materialStr}wall mirror designed to open up your space and reflect natural light. A versatile accent piece that works beautifully in bedrooms, hallways, and living areas.`
  }

  if (t.includes("coffee table") || t.includes("center table")) {
    return `A thoughtfully designed ${materialStr}coffee table that anchors your living room with modern character. Crafted for everyday use with a refined finish that pairs effortlessly with any sofa or sectional.`
  }

  if (t.includes("side table") || t.includes("corner table")) {
    return `A versatile ${materialStr}side table designed for both style and function. The perfect companion beside a sofa, armchair, or bed — offering a convenient surface with a clean, contemporary look.`
  }

  // Generic fallback
  return `A premium quality ${materialStr}furniture piece designed to elevate your home with timeless style and lasting craftsmanship.`
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function fixDescriptions() {
  console.log("✏️  Fix descriptions script started")

  try {
    await payload.init({ config })
    console.log("✅ Payload initialized\n")
  } catch (err) {
    console.error("❌ Payload init failed:", err)
    process.exit(1)
  }

  // ── Load target categories ────────────────────────────────────────────────
  const categoryIds: string[] = []

  for (const slug of TARGET_CATEGORY_SLUGS) {
    const result = await payload.find({
      collection: "categories",
      where: { slug: { equals: slug } },
      limit: 1,
    })
    if (result.totalDocs > 0) {
      categoryIds.push(result.docs[0].id as string)
      console.log(`📂 Found category: ${slug}`)
    } else {
      console.warn(`⚠️  Category not found in DB: "${slug}"`)
    }
  }

  if (categoryIds.length === 0) {
    console.error("❌ No target categories found in DB.")
    process.exit(1)
  }

  // ── Fetch all products in target categories ───────────────────────────────
  console.log("\n🔍 Fetching products...")

  const products: any[] = []
  for (const catId of categoryIds) {
    const result = await payload.find({
      collection: "products",
      where: { category: { equals: catId } },
      limit: 200,
      overrideAccess: true,
    })
    products.push(...result.docs)
  }

  console.log(`   Found ${products.length} products\n`)

  if (products.length === 0) {
    console.error("❌ No products found in target categories.")
    process.exit(1)
  }

  // ── Update each product ───────────────────────────────────────────────────
  let updated = 0

  for (const product of products) {
    const newDescription = buildDescription(product.title ?? "")

    await payload.update({
      collection: "products",
      id: product.id,
      data: { Description: newDescription },
      overrideAccess: true,
    })

    updated++
    console.log(`  ✅ "${product.title?.slice(0, 55)}"`)
    console.log(`     → ${newDescription.slice(0, 100)}…\n`)
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("─────────────────────────────────────────")
  console.log("🎉 Done!")
  console.log(`   Descriptions updated: ${updated}`)
  console.log("─────────────────────────────────────────\n")

  process.exit(0)
}

fixDescriptions().catch((err) => {
  console.error("\n❌ Script failed:", err)
  process.exit(1)
})