/**
 * Doma Backend — CSV Furniture Seed Script (Dining & Office)
 *
 * Seeds products from a CSV file (Amazon furniture dataset format).
 * Downloads product images from URLs and uploads them to Payload media.
 *
 * Usage:
 *   npx payload run src/scripts/seed-csv-products.ts
 *
 * Env vars (all optional):
 *   CSV_PATH               — absolute path to CSV file
 *                            (default: src/scripts/furniture_amazon_dataset_sample_copy.csv)
 *   TARGET_CATEGORIES      — comma-separated slugs to seed
 *                            (default: "dining,office")
 *   MAX_IMAGES_PER_PRODUCT — images to download per product, min 2 (default: 2)
 *   MAX_PRODUCTS_TOTAL     — hard cap on total products created (default: 100)
 */
import dotenv from "dotenv"
import * as path from "path"
dotenv.config({ path: path.resolve(process.cwd(), ".env") })

import payload from "payload"
import config from "@payload-config"
import * as fs from "fs"
import * as https from "https"
import * as http from "http"
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

const MAX_IMAGES_PER_PRODUCT = Math.max(
  2,
  parseInt(process.env.MAX_IMAGES_PER_PRODUCT || "2", 10)
)

const MAX_PRODUCTS_TOTAL = parseInt(process.env.MAX_PRODUCTS_TOTAL || "100", 10)

const TEMP_DIR = path.join(process.cwd(), ".tmp-csv-seed-images")

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY KEYWORD MAP
// Maps your Payload category slugs → keywords to match against CSV categories
// Add more entries here if you add new category slugs to your DB.
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  dining: ["dining", "bar stool", "barstool", "kitchen chair"],
  office: ["office", "desk", "workstation", "bookcase", "home office"],
  chair: ["chair", "armchair", "recliner", "ottoman", "stool", "rocker"],
  sofa: ["sofa", "couch"],
  loveseat: ["loveseat"],
  sectional: ["sectional"],
  "living-room": ["living room", "lounge"],
  bedroom: ["bed", "nightstand", "dresser", "wardrobe"],
  table: ["coffee table", "side table", "end table", "accent table", "dining table"],
  storage: ["storage", "shelf", "shelves", "cabinet", "bookcase"],
  home: ["home decor", "accent", "decor"],
  furniture: [], // catch-all — never matched by keywords, used as fallback
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED VENDORS (same as existing seed script — reused by slug/email)
// ─────────────────────────────────────────────────────────────────────────────

const SEED_VENDORS = [
  { storeName: "Aura Living", email: "aura@seed.dev" },
  { storeName: "Timber & Co.", email: "timber@seed.dev" },
  { storeName: "Modern Nest", email: "modernnest@seed.dev" },
  { storeName: "Crafted Spaces", email: "crafted@seed.dev" },
  { storeName: "Velvet House", email: "velvet@seed.dev" },
  { storeName: "Nordic Roots", email: "nordic@seed.dev" },
  { storeName: "Studio Hom", email: "studiohom@seed.dev" },
  { storeName: "The Oak Room", email: "oakroom@seed.dev" },
  { storeName: "Plush & Pine", email: "plush@seed.dev" },
  { storeName: "Urban Grain", email: "urbangrain@seed.dev" },
]

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) // keep slugs sane length
}

/** Parse a Python-style list string: "['a', 'b']" → ["a", "b"] */
function parsePythonList(raw: string): string[] {
  if (!raw) return []
  try {
    // Replace Python single-quotes with double-quotes, then JSON parse
    const jsonStr = raw
      .trim()
      .replace(/'/g, '"')
    return JSON.parse(jsonStr)
  } catch {
    // Fallback: strip brackets and split on comma
    return raw
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean)
  }
}

/** Resolve which category slug this CSV row belongs to */
function resolveCategorySlugFromCsvCategories(
  csvCats: string[],
  targetSlugs: string[]
): string | null {
  const joined = csvCats.join(" ").toLowerCase()

  for (const slug of targetSlugs) {
    const keywords = CATEGORY_KEYWORDS[slug] ?? []
    if (keywords.some((kw) => joined.includes(kw))) {
      return slug
    }
  }
  return null
}

/** Parse a USD price string like "$140.00" → number in PKR (approximate) */
function parsePrice(raw: string | undefined): number {
  if (!raw) return Math.floor(Math.random() * 335_000) + 15_000
  const usd = parseFloat(raw.replace(/[^0-9.]/g, ""))
  if (isNaN(usd)) return Math.floor(Math.random() * 335_000) + 15_000
  // Rough USD → PKR conversion (1 USD ≈ 278 PKR as of early 2024)
  // Round to nearest 100 for clean pricing
  return Math.round((usd * 278) / 100) * 100
}

/** Download a URL to a temp file. Returns the local path or null on failure. */
async function downloadImage(url: string, destPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const cleanUrl = url.trim()
    const lib = cleanUrl.startsWith("https") ? https : http

    const file = fs.createWriteStream(destPath)

    const req = lib.get(cleanUrl, { timeout: 15_000 }, (res) => {
      // Follow one level of redirect
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close()
        fs.unlinkSync(destPath)
        if (res.headers.location) {
          downloadImage(res.headers.location, destPath).then(resolve)
        } else {
          resolve(false)
        }
        return
      }

      if (res.statusCode !== 200) {
        file.close()
        fs.unlinkSync(destPath)
        resolve(false)
        return
      }

      res.pipe(file)
      file.on("finish", () => { file.close(); resolve(true) })
      file.on("error", () => { file.close(); fs.unlinkSync(destPath); resolve(false) })
    })

    req.on("error", () => { file.close(); if (fs.existsSync(destPath)) fs.unlinkSync(destPath); resolve(false) })
    req.on("timeout", () => { req.destroy(); resolve(false) })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE UPLOAD (identical logic to existing seed.ts)
// ─────────────────────────────────────────────────────────────────────────────

async function uploadLocalImage(imagePath: string, altText: string): Promise<string | null> {
  try {
    const filename = path.basename(imagePath)
    const ext = path.extname(filename).toLowerCase()

    const mimeMap: Record<string, string> = {
      ".png": "image/png",
      ".webp": "image/webp",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
    }

    const stat = fs.statSync(imagePath)
    if (stat.size > 5 * 1024 * 1024) {
      console.warn(`  ⚠️  Skipping large image (${(stat.size / 1024 / 1024).toFixed(1)}MB): ${filename}`)
      return null
    }

    const data = fs.readFileSync(imagePath)

    const media = await payload.create({
      collection: "media",
      data: { alt: altText },
      file: {
        data,
        mimetype: mimeMap[ext] ?? "image/jpeg",
        name: filename,
        size: data.length,
      },
      overrideAccess: true,
    })

    return media.id as string
  } catch (err) {
    console.warn(`  ⚠️  Upload failed: ${(err as Error).message}`)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENSURE VENDORS (reuse existing, create if missing)
// ─────────────────────────────────────────────────────────────────────────────

async function ensureVendors(): Promise<string[]> {
  console.log("\n👥 Ensuring seed vendors...")
  const vendorIds: string[] = []

  for (const v of SEED_VENDORS) {
    const slug = slugify(v.storeName)
    const email = v.email.trim().toLowerCase()

    const existingBySlug = await payload.find({
      collection: "vendors",
      where: { slug: { equals: slug } },
      limit: 1,
    })

    const existingByEmail = await payload.find({
      collection: "vendors",
      where: { email: { equals: email } },
      limit: 1,
    })

    if (existingBySlug.totalDocs > 0 || existingByEmail.totalDocs > 0) {
      const existing = existingBySlug.totalDocs > 0 ? existingBySlug.docs[0] : existingByEmail.docs[0]
      vendorIds.push(existing.id as string)
      console.log(`  ↩️  Reused: ${v.storeName}`)
      continue
    }

    const created = await payload.create({
      collection: "vendors",
      data: {
        storeName: v.storeName,
        slug,
        email,
        password: "SeedPass123!",
        status: "approved",
        role: "vendor",
        storeDescription: `Seed vendor — ${v.storeName}`,
      },
      overrideAccess: true,
    })

    vendorIds.push(created.id as string)
    console.log(`  ✅ Created: ${v.storeName}`)
  }

  return vendorIds
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD TARGET CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

async function loadTargetCategories(slugs: string[]): Promise<Map<string, string>> {
  console.log(`\n📂 Loading target categories: ${slugs.join(", ")}`)
  const categoryMap = new Map<string, string>()

  for (const slug of slugs) {
    const result = await payload.find({
      collection: "categories",
      where: { slug: { equals: slug } },
      limit: 1,
    })

    if (result.totalDocs > 0) {
      categoryMap.set(slug, result.docs[0].id as string)
      console.log(`  ✅ Found: ${slug}`)
    } else {
      console.warn(`  ⚠️  Not found in DB: "${slug}" — create this category in your admin panel first!`)
    }
  }

  return categoryMap
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SEED
// ─────────────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("🌱 CSV seed script started")

  try {
    await payload.init({ config })
    console.log("✅ Payload initialized")
  } catch (err) {
    console.error("❌ Payload init failed:", err)
    process.exit(1)
  }

  console.log(`\n   CSV path         : ${CSV_PATH}`)
  console.log(`   Target categories: ${TARGET_CATEGORY_SLUGS.join(", ")}`)
  console.log(`   Images/product   : ${MAX_IMAGES_PER_PRODUCT}`)
  console.log(`   Max products     : ${MAX_PRODUCTS_TOTAL}`)

  // ── Validate CSV ─────────────────────────────────────────────────────────
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`\n❌ CSV not found at: ${CSV_PATH}`)
    process.exit(1)
  }

  // ── Parse CSV ────────────────────────────────────────────────────────────
  const rawCsv = fs.readFileSync(CSV_PATH, "utf8")
  const rows: Record<string, string>[] = parse(rawCsv, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true,
  })

  console.log(`\n   Total CSV rows: ${rows.length}`)

  // ── Filter rows for target categories ────────────────────────────────────
  const matchedRows: Array<{ row: Record<string, string>; categorySlug: string }> = []
  const seenTitles = new Set<string>()

  for (const row of rows) {
    const csvCats = parsePythonList(row.categories ?? "")
    const slug = resolveCategorySlugFromCsvCategories(csvCats, TARGET_CATEGORY_SLUGS)
    if (!slug) continue

    // Skip duplicates by title
    const titleKey = (row.title ?? "").toLowerCase().trim()
    if (!titleKey || seenTitles.has(titleKey)) continue
    seenTitles.add(titleKey)

    // Skip products with no images at all
    const imageUrls = parsePythonList(row.images ?? "")
    if (!row.primary_image && imageUrls.length === 0) continue

    matchedRows.push({ row, categorySlug: slug })
  }

  console.log(`   Matched rows (unique, has images): ${matchedRows.length}`)

  if (matchedRows.length === 0) {
    console.error("\n❌ No matching products found. Check TARGET_CATEGORIES and your CSV.")
    process.exit(1)
  }

  // ── Ensure temp dir ──────────────────────────────────────────────────────
  if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true })

  // ── Ensure vendors & categories ──────────────────────────────────────────
  const vendorIds = await ensureVendors()
  const categoryMap = await loadTargetCategories(TARGET_CATEGORY_SLUGS)

  if (categoryMap.size === 0) {
    console.error("\n❌ None of the target categories exist in your DB. Create them first.")
    process.exit(1)
  }

  // ── Seed products ─────────────────────────────────────────────────────────
  console.log("\n🛋️  Seeding products from CSV...")

  let productCount = 0
  let skipCount = 0
  const capped = matchedRows.slice(0, MAX_PRODUCTS_TOTAL)

  for (let i = 0; i < capped.length; i++) {
    const { row, categorySlug } = capped[i]

    const title = (row.title ?? "Unknown Product").trim().split(",")[0].trim().slice(0, 60)
    const slug = slugify(title)

    // Check slug uniqueness
    const existing = await payload.find({
      collection: "products",
      where: { slug: { equals: slug } },
      limit: 1,
    })

    if (existing.totalDocs > 0) {
      console.log(`  ⏭️  Skipping "${title.slice(0, 60)}…" — slug exists`)
      skipCount++
      continue
    }

    // Collect image URLs (primary first, then extras)
    const extraUrls = parsePythonList(row.images ?? "")
    const allUrls = [
      ...(row.primary_image ? [row.primary_image.trim()] : []),
      ...extraUrls.map((u) => u.trim()),
    ]
      .filter((u) => u.startsWith("http"))
      // Deduplicate
      .filter((u, idx, arr) => arr.indexOf(u) === idx)
      .slice(0, MAX_IMAGES_PER_PRODUCT)

    if (allUrls.length < 2) {
      console.log(`  ⏭️  Skipping "${title.slice(0, 60)}…" — fewer than 2 image URLs`)
      skipCount++
      continue
    }

    // Download images to temp
    const localPaths: string[] = []
    for (let j = 0; j < allUrls.length; j++) {
      const ext = path.extname(new URL(allUrls[j]).pathname) || ".jpg"
      const dest = path.join(TEMP_DIR, `${slug}-${j}${ext}`)
      const ok = await downloadImage(allUrls[j], dest)
      if (ok) localPaths.push(dest)
    }

    if (localPaths.length < 2) {
      console.log(`  ⚠️  Skipping "${title.slice(0, 60)}…" — only ${localPaths.length} image(s) downloaded`)
      skipCount++
      // Clean up any partial downloads
      localPaths.forEach((p) => fs.existsSync(p) && fs.unlinkSync(p))
      continue
    }

    // Upload to Payload media
    const mediaIds: string[] = []
    for (const lp of localPaths) {
      const id = await uploadLocalImage(lp, title)
      if (id) mediaIds.push(id)
      fs.existsSync(lp) && fs.unlinkSync(lp) // clean up immediately
    }

    if (mediaIds.length < 2) {
      console.log(`  ⚠️  Skipping "${title.slice(0, 60)}…" — uploads failed`)
      skipCount++
      continue
    }

    // Build description from available fields
    const aboutItem = (row.about_item ?? "").replace(/\s+/g, " ").trim()
    const description = aboutItem
      ? aboutItem.slice(0, 500)
      : `${title} — premium quality furniture for your home.`

    const price = parsePrice(row.price)
    const categoryId = categoryMap.get(categorySlug) ?? null
    const vendorId = vendorIds[i % vendorIds.length]

    await payload.create({
      collection: "products",
      data: {
        title,
        slug,
        Description: description,
        pricing: { price },
        inventory: {
          quantity: Math.floor(Math.random() * 50) + 5,
          lowStockThreshold: 5,
        },
        images: mediaIds.map((id) => ({
          image: id,
          alt: title,
        })),
        category: categoryId ?? undefined,
        vendor: vendorId,
        status: "published",
        featured: productCount < 5,
        model3dStatus: "none",
      },
      overrideAccess: true,
    })

    productCount++
    console.log(
      `  ✅ [${productCount}] ${title.slice(0, 55)}… → ${categorySlug} — ₨${price.toLocaleString()}`
    )
  }

  // ── Cleanup temp dir ──────────────────────────────────────────────────────
  try { fs.rmdirSync(TEMP_DIR) } catch { /* not empty or already gone */ }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log("\n─────────────────────────────────────────")
  console.log("🎉 CSV seed complete!")
  console.log(`   Products created : ${productCount}`)
  console.log(`   Products skipped : ${skipCount}`)
  console.log(`   Categories seeded: ${[...categoryMap.keys()].join(", ")}`)
  console.log("─────────────────────────────────────────\n")

  process.exit(0)
}

seed().catch((err) => {
  console.error("\n❌ CSV seed failed:", err)
  process.exit(1)
})