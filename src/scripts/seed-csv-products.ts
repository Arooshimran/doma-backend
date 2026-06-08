/**
 * Doma Backend — CSV Furniture Seed Script (Lamps, Mirrors & Tables)
 *
 * Seeds products from the combined-products CSV.
 * Downloads product images from URLs and uploads them to Payload media.
 *
 * CSV columns expected:
 *   title, categories, primary_image, extra_images, description, price
 *
 * Category routing:
 *   table lamp      → bedroom
 *   floor lamp      → living-room
 *   full length mirror → bedroom
 *   corner/side table  → living-room
 *   center/coffee table → living-room
 *
 * Usage:
 *   npx payload run src/scripts/seed-csv-products.ts
 *
 * Env vars (all optional):
 *   CSV_PATH               — absolute path to CSV file
 *                            (default: src/scripts/combined-products.csv)
 *   TARGET_CATEGORIES      — comma-separated slugs to seed
 *                            (default: "bedroom,living-room")
 *   MAX_IMAGES_PER_PRODUCT — images to download per product, min 1 (default: 2)
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
  path.join(process.cwd(), "src", "scripts", "combined-products.csv")

const TARGET_CATEGORY_SLUGS = (process.env.TARGET_CATEGORIES || "bedroom,living-room")
  .split(",")
  .map((s) => s.trim().toLowerCase())

const MAX_IMAGES_PER_PRODUCT = Math.max(
  1,
  parseInt(process.env.MAX_IMAGES_PER_PRODUCT || "2", 10)
)

const MAX_PRODUCTS_TOTAL = parseInt(process.env.MAX_PRODUCTS_TOTAL || "100", 10)

const TEMP_DIR = path.join(process.cwd(), ".tmp-csv-seed-images")

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY KEYWORD MAP
// Maps CSV category strings → Payload category slugs
//
// The CSV uses comma-separated plain strings in the `categories` column, e.g.:
//   "table lamp, lighting"
//   "floor lamp, lighting"
//   "full length mirror, mirrors"
//   "corner table, side table"
//   "center table, coffee table"
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  // ── Your target categories ──────────────────────────────────────────────
  bedroom: ["table lamp", "full length mirror"],
  "living-room": ["floor lamp", "corner table", "side table", "center table", "coffee table"],

  // ── Additional slugs (kept for future use / other scripts) ──────────────
  dining: ["dining", "bar stool", "barstool", "kitchen chair"],
  office: ["office", "desk", "workstation", "bookcase", "home office"],
  chair: ["chair", "armchair", "recliner", "ottoman", "stool", "rocker"],
  sofa: ["sofa", "couch"],
  loveseat: ["loveseat"],
  sectional: ["sectional"],
  table: ["coffee table", "side table", "end table", "accent table", "dining table"],
  storage: ["storage", "shelf", "shelves", "cabinet"],
  home: ["home decor", "accent", "decor"],
  furniture: [], // catch-all — never matched by keywords
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED VENDORS
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
    .slice(0, 96)
}

/**
 * Parse the CSV `categories` column.
 * The column is a plain comma-separated string, e.g. "table lamp, lighting".
 * No Python-list brackets — just split on comma.
 */
function parseCsvCategories(raw: string): string[] {
  if (!raw) return []
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Parse the CSV `extra_images` column.
 * May be empty/NaN, a single URL, or a Python-style list string.
 */
function parseExtraImages(raw: string | undefined): string[] {
  if (!raw || raw.trim() === "" || raw.trim().toLowerCase() === "nan") return []

  // Python-style list: ['url1', 'url2']
  if (raw.trim().startsWith("[")) {
    try {
      const jsonStr = raw.trim().replace(/'/g, '"')
      return JSON.parse(jsonStr)
    } catch {
      return raw
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean)
    }
  }

  // Single URL or whitespace-separated list
  return raw.split(/\s+/).map((s) => s.trim()).filter((s) => s.startsWith("http"))
}

/** Resolve which Payload category slug this CSV row belongs to */
function resolveCategorySlug(
  csvCategories: string[],
  targetSlugs: string[]
): string | null {
  const joined = csvCategories.join(" ")

  for (const slug of targetSlugs) {
    const keywords = CATEGORY_KEYWORDS[slug] ?? []
    if (keywords.some((kw) => joined.includes(kw))) {
      return slug
    }
  }
  return null
}

/**
 * Parse a USD price string like "$140.00" → PKR number.
 * Conversion: 1 USD ≈ 278 PKR, rounded to nearest 100.
 * Falls back to a random realistic PKR price if unparseable.
 */
function parsePrice(raw: string | undefined): number {
  if (!raw || raw.trim() === "" || raw.trim().toLowerCase() === "nan") {
    return Math.floor(Math.random() * 335_000) + 15_000
  }
  const usd = parseFloat(raw.replace(/[^0-9.]/g, ""))
  if (isNaN(usd)) return Math.floor(Math.random() * 335_000) + 15_000
  return Math.round((usd * 278) / 100) * 100
}

/** Download a URL to a temp file. Returns true on success. */
async function downloadImage(url: string, destPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const cleanUrl = url.trim()
    const lib = cleanUrl.startsWith("https") ? https : http

    const file = fs.createWriteStream(destPath)

    const req = lib.get(cleanUrl, { timeout: 15_000 }, (res) => {
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

    req.on("error", () => {
      file.close()
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
      resolve(false)
    })
    req.on("timeout", () => { req.destroy(); resolve(false) })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE UPLOAD
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
// ENSURE VENDORS
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
      const existing =
        existingBySlug.totalDocs > 0 ? existingBySlug.docs[0] : existingByEmail.docs[0]
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
      console.warn(
        `  ⚠️  Not found in DB: "${slug}" — create this category in your admin panel first!`
      )
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

  // ── Filter & match rows ───────────────────────────────────────────────────
  const matchedRows: Array<{ row: Record<string, string>; categorySlug: string }> = []
  const seenTitles = new Set<string>()

  for (const row of rows) {
    // Parse the plain comma-separated categories column
    const csvCats = parseCsvCategories(row.categories ?? "")
    const slug = resolveCategorySlug(csvCats, TARGET_CATEGORY_SLUGS)
    if (!slug) continue

    // Skip color-variant rows that have no real product name
    const titleKey = (row.title ?? "").toLowerCase().trim()
    if (!titleKey || titleKey.startsWith("color:")) {
      console.log(`  ⏭️  Skipping color variant row: "${row.title}"`)
      continue
    }
    if (seenTitles.has(titleKey)) continue
    seenTitles.add(titleKey)

    // Must have at least a primary image
    if (!row.primary_image || !row.primary_image.trim().startsWith("http")) continue

    matchedRows.push({ row, categorySlug: slug })
  }

  console.log(`   Matched rows (unique, has image): ${matchedRows.length}`)

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

    // ── Field mapping ──────────────────────────────────────────────────────
    // CSV column  → script variable
    // title       → title / slug
    // description → Description (falls back to generic)
    // price       → pricing.price  (USD string → PKR number)
    // primary_image → first image URL
    // extra_images  → additional image URLs (may be empty)

    const title = (row.title ?? "Unknown Product").trim().slice(0, 60)
    const slug = slugify(title)

    // Check slug uniqueness
    const existing = await payload.find({
      collection: "products",
      where: { slug: { equals: slug } },
      limit: 1,
    })

    if (existing.totalDocs > 0) {
      console.log(`  ⏭️  Skipping "${title}" — slug exists`)
      skipCount++
      continue
    }

    // ── Collect image URLs ─────────────────────────────────────────────────
    // primary_image is a single URL; extra_images may be empty or a list
    const extraUrls = parseExtraImages(row.extra_images)
    const allUrls = [
      row.primary_image?.trim(),
      ...extraUrls,
    ]
      .filter((u): u is string => !!u && u.startsWith("http"))
      .filter((u, idx, arr) => arr.indexOf(u) === idx) // deduplicate
      .slice(0, MAX_IMAGES_PER_PRODUCT)

    if (allUrls.length === 0) {
      console.log(`  ⏭️  Skipping "${title}" — no valid image URLs`)
      skipCount++
      continue
    }

    // ── Download images ────────────────────────────────────────────────────
    const localPaths: string[] = []
    for (let j = 0; j < allUrls.length; j++) {
      let ext: string
      try {
        ext = path.extname(new URL(allUrls[j]).pathname) || ".jpg"
        // Strip query params from extension (e.g. ".jpg?w=800" → ".jpg")
        if (ext.includes("?")) ext = ext.split("?")[0]
        if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) ext = ".jpg"
      } catch {
        ext = ".jpg"
      }

      const dest = path.join(TEMP_DIR, `${slug}-${j}${ext}`)
      const ok = await downloadImage(allUrls[j], dest)
      if (ok) localPaths.push(dest)
    }

    if (localPaths.length === 0) {
      console.log(`  ⚠️  Skipping "${title}" — no images downloaded`)
      skipCount++
      continue
    }

    // ── Upload to Payload media ────────────────────────────────────────────
    const mediaIds: string[] = []
    for (const lp of localPaths) {
      const id = await uploadLocalImage(lp, title)
      if (id) mediaIds.push(id)
      if (fs.existsSync(lp)) fs.unlinkSync(lp)
    }

    if (mediaIds.length === 0) {
      console.log(`  ⚠️  Skipping "${title}" — all uploads failed`)
      skipCount++
      continue
    }

    // ── Build description ──────────────────────────────────────────────────
    // CSV `description` column maps directly to Payload `Description`
    const description = (row.description ?? "").replace(/\s+/g, " ").trim().slice(0, 500)
      || `${title} — premium quality for your home.`

    // ── Parse price: CSV `price` (USD string) → PKR number ────────────────
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
        featured: productCount < 0,
        model3dStatus: "none",
      },
      overrideAccess: true,
    })

    productCount++
    console.log(
      `  ✅ [${productCount}] ${title.slice(0, 50)} → ${categorySlug} — ₨${price.toLocaleString()}`
    )
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────
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