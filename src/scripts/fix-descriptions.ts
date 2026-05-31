/**
 * Doma Backend — Fix Product Descriptions (CSV-based, no API)
 *
 * Finds all products in your dining and office categories,
 * matches them to CSV rows by title, and builds clean descriptions
 * from available fields (brand, material, color, style, about_item).
 *
 * Usage:
 *   node --env-file=.env --import tsx src/scripts/fix-descriptions.ts
 *
 * Env vars (optional):
 *   CSV_PATH           — path to CSV file
 *   TARGET_CATEGORIES  — comma-separated slugs (default: "dining,office")
 */
import dotenv from "dotenv"
import * as path from "path"
dotenv.config({ path: path.resolve(process.cwd(), ".env") })

import payload from "payload"
import config from "@payload-config"
import * as fs from "fs"
import { parse } from "csv-parse/sync"

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const CSV_PATH =
  process.env.CSV_PATH ||
  path.join(process.cwd(), "src", "scripts", "furniture_amazon_dataset_sample_copy.csv")

const TARGET_CATEGORY_SLUGS = (process.env.TARGET_CATEGORIES || "dining,office")
  .split(",")
  .map((s) => s.trim().toLowerCase())

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a Python-style list string or dict list into plain text */
function parsePythonList(raw: string): string[] {
  if (!raw) return []
  try {
    const jsonStr = raw.trim().replace(/'/g, '"')
    const parsed = JSON.parse(jsonStr)
    if (Array.isArray(parsed)) return parsed.map((s: any) => String(s).trim()).filter(Boolean)
    return []
  } catch {
    return raw
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean)
  }
}

/** Extract bullet points from about_item field */
function parseAboutItem(raw: string): string[] {
  if (!raw) return []
  const items = parsePythonList(raw)
  if (items.length > 0) return items

  // Fallback: split on newlines or bullet markers
  return raw
    .split(/[\n•●▪]/)
    .map((s) => s.replace(/【[^】]*】/g, "").trim())
    .filter((s) => s.length > 10 && s.length < 200)
}

/** Normalize title for fuzzy matching — strips brand prefix noise */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
}

/** Build a clean, human-readable description from CSV fields */
function buildDescription(row: Record<string, string>): string {
  const parts: string[] = []

  // Line 1: Brand + clean product name + key attributes
  const brand = (row.brand ?? "").trim()
  const color = (row.color ?? "").trim()
  const material = (row.material ?? "").trim()
  const style = (row.style ?? "").trim()

  const attrs = [color, material, style].filter(Boolean).join(", ")
  const cleanTitle = (row.title ?? "")
    .trim()
    .split(",")[0]
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())

  if (brand && attrs) {
    parts.push(`${cleanTitle} by ${brand}. ${attrs}.`)
  } else if (brand) {
    parts.push(`${cleanTitle} by ${brand}.`)
  } else if (attrs) {
    parts.push(`${cleanTitle}. ${attrs}.`)
  } else {
    parts.push(`${cleanTitle}.`)
  }

  // Line 2: Top 3 bullet points from about_item, cleaned up
  const bullets = parseAboutItem(row.about_item ?? "")
    .slice(0, 3)
    .map((b) =>
      b
        .replace(/^[-–—•*]+\s*/, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((b) => b.length > 10)

  if (bullets.length > 0) {
    parts.push(bullets.join(" "))
  }

  return parts.join(" ").slice(0, 500)
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

  // ── Load CSV ──────────────────────────────────────────────────────────────
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`❌ CSV not found at: ${CSV_PATH}`)
    process.exit(1)
  }

  const rawCsv = fs.readFileSync(CSV_PATH, "utf8")
  const csvRows: Record<string, string>[] = parse(rawCsv, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true,
  })

  // Build a lookup map: normalizedTitle → row
  const csvMap = new Map<string, Record<string, string>>()
  for (const row of csvRows) {
    const key = normalizeTitle(row.title ?? "")
    if (key) csvMap.set(key, row)
  }

  console.log(`   CSV loaded: ${csvRows.length} rows, ${csvMap.size} unique titles\n`)

  // ── Load target categories from DB ────────────────────────────────────────
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
  console.log("\n🔍 Fetching products from DB...")

  const products: any[] = []
  for (const catId of categoryIds) {
    const result = await payload.find({
      collection: "products",
      where: { category: { equals: catId } },
      limit: 200,
    })
    products.push(...result.docs)
  }

  console.log(`   Found ${products.length} products to update\n`)

  // ── Update each product ───────────────────────────────────────────────────
  let updated = 0
  let noMatch = 0

  for (const product of products) {
    const productTitleNorm = normalizeTitle(product.title ?? "")

    // Try exact match first
    let csvRow = csvMap.get(productTitleNorm)

    // Fallback: partial match (product title starts with CSV title or vice versa)
    if (!csvRow) {
      for (const [key, row] of csvMap.entries()) {
        if (
          productTitleNorm.startsWith(key.slice(0, 30)) ||
          key.startsWith(productTitleNorm.slice(0, 30))
        ) {
          csvRow = row
          break
        }
      }
    }

    if (!csvRow) {
      console.log(`  ⚠️  No CSV match for: "${product.title?.slice(0, 60)}"`)
      noMatch++
      continue
    }

    const newDescription = buildDescription(csvRow)

    await payload.update({
      collection: "products",
      id: product.id,
      data: { Description: newDescription },
      overrideAccess: true,
    })

    updated++
    console.log(`  ✅ Updated: "${product.title?.slice(0, 55)}"`)
    console.log(`     → ${newDescription.slice(0, 100)}…\n`)
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("─────────────────────────────────────────")
  console.log("🎉 Done!")
  console.log(`   Updated  : ${updated}`)
  console.log(`   No match : ${noMatch} (these keep their old description)`)
  console.log("─────────────────────────────────────────\n")

  process.exit(0)
}

fixDescriptions().catch((err) => {
  console.error("\n❌ Script failed:", err)
  process.exit(1)
})