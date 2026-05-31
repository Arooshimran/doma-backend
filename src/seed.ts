/**
 * Doma Backend — Furniture Image Dataset Seed Script
 *
 * Dataset structure expected:
 *   DATASET_PATH/
 *     classes/      ← 7 broad category folders (chair, sofa, table, etc.)
 *     instances/    ← descriptive product folders (e.g. "armchair with round arms")
 *
 * Usage:
 *   npx payload run src/scripts/seed.ts
 *
 * Env vars (all optional):
 *   FURNITURE_DATASET_PATH     — absolute path to dataset root (default: src/scripts/furniture-dataset)
 *   MAX_IMAGES_PER_PRODUCT     — images to upload per product, must be >= 2 (default: 2)
 *   MAX_PRODUCTS_TOTAL         — hard cap on total products created (default: 100)
 */
import dotenv from "dotenv"
dotenv.config({ path: path.resolve(process.cwd(), ".env") })

import payload from "payload"
import config from "@payload-config"
import * as fs from "fs"
import * as path from "path"

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const DATASET_PATH =
  process.env.FURNITURE_DATASET_PATH ||
  path.join(process.cwd(), "src", "scripts", "furniture-dataset")

const MAX_IMAGES_PER_PRODUCT = Math.max(
  2,
  parseInt(process.env.MAX_IMAGES_PER_PRODUCT || "2", 10)
)

// Total products to seed — 100 products × 2 images = ~200 images
const MAX_PRODUCTS_TOTAL = parseInt(process.env.MAX_PRODUCTS_TOTAL || "100", 10)

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"])

// ─────────────────────────────────────────────────────────────────────────────
// SEED VENDOR DATA
// 10 vendors that will be round-robin assigned to products
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
// CATEGORY MAPPING
// Maps instance folder names → your EXISTING category slugs:
//   office | bedroom | living-room | furniture | home | sofa |
//   dining | chair | sectional | loveseat | storage | table
//
// Make sure these slugs exist in your DB, or add them via the admin panel first.
// No new categories are created here — products are assigned to existing ones only.
// ─────────────────────────────────────────────────────────────────────────────

function resolveCategorySlug(folderName: string): string {
  const lower = folderName.toLowerCase()

  // dining — catches dining table, dining chair, dining room, bar stool
  if (
    lower.includes("dining") ||
    lower.includes("bar stool") ||
    lower.includes("barstool") ||
    lower.includes("dining room")
  )
    return "dining"

  // sofa — catches sofa, couch
  if (lower.includes("sofa") || lower.includes("couch"))
    return "sofa"

  // loveseat — more specific than sofa, check before living-room
  if (lower.includes("loveseat"))
    return "loveseat"

  // sectional — check before living-room
  if (lower.includes("sectional"))
    return "sectional"

  // living-room — catches living room, lounge
  if (lower.includes("living room") || lower.includes("lounge"))
    return "living-room"

  // bedroom — catches bed, nightstand, dresser, wardrobe
  if (
    lower.includes("bed") ||
    lower.includes("nightstand") ||
    lower.includes("dresser") ||
    lower.includes("wardrobe")
  )
    return "bedroom"

  // office — catches desk, office chair, workstation
  if (
    lower.includes("desk") ||
    lower.includes("office") ||
    lower.includes("workstation")
  )
    return "office"

  // table — catches coffee table, side table, end table, accent table
  if (lower.includes("table"))
    return "table"

  // storage — catches storage, shelf, cabinet, bookcase
  if (
    lower.includes("storage") ||
    lower.includes("shelf") ||
    lower.includes("cabinet") ||
    lower.includes("bookcase")
  )
    return "storage"

  // chair — catches armchair, accent chair, rocking chair, etc.
  if (
    lower.includes("chair") ||
    lower.includes("armchair") ||
    lower.includes("stool") ||
    lower.includes("ottoman") ||
    lower.includes("recliner") ||
    lower.includes("rocker")
  )
    return "chair"

  // home — catch-all for anything home/decor related
  if (lower.includes("home") || lower.includes("decor") || lower.includes("accent"))
    return "home"

  // furniture — absolute catch-all
  return "furniture"
}

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING CATEGORY SLUGS
// Add any new slugs here AND create matching categories in your admin panel.
// ─────────────────────────────────────────────────────────────────────────────

const EXISTING_CATEGORY_SLUGS = [
  "office",
  "bedroom",
  "living-room",
  "furniture",
  "home",
  "sofa",
  "dining",      // ← new
  "chair",       // ← new (maps to dataset's "chair" class folder)
  "sectional",   // ← new (maps to dataset's "sectional" class folder)
  "loveseat",    // ← new (maps to dataset's "loveseat" class folder)
  "storage",     // ← new (maps to dataset's "storage" class folder)
  "table",       // ← new (maps to dataset's "table" class folder)
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
}

function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase())
}

function collectImages(dir: string, limit: number): string[] {
  if (!fs.existsSync(dir)) return []
  const allFiles = fs
    .readdirSync(dir)
    .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .map((f) => path.join(dir, f))
    .filter((f) => fs.statSync(f).size <= 5 * 1024 * 1024) // ← add this line, skips files over 5MB
    .sort(() => Math.random() - 0.5)
  return allFiles.slice(0, limit)
}

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE UPLOAD
// ─────────────────────────────────────────────────────────────────────────────

async function uploadImage(imagePath: string): Promise<string | null> {
  try {
    const filename = path.basename(imagePath)
    const ext = path.extname(filename).toLowerCase()
    const data = fs.readFileSync(imagePath)

    const mimeMap: Record<string, string> = {
      ".png": "image/png",
      ".webp": "image/webp",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
    }

    const media = await payload.create({
      collection: "media",
      data: {
        alt: filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
      },
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
    console.warn(`  ⚠️  Upload failed (${path.basename(imagePath)}):`, (err as Error).message)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ENSURE VENDORS
// Creates the 10 seed vendors if they don't already exist.
// Returns array of vendor IDs in the same order as SEED_VENDORS.
// ─────────────────────────────────────────────────────────────────────────────

async function ensureVendors(): Promise<string[]> {
    console.log("\n👥 Ensuring seed vendors...")
    const vendorIds: string[] = []
  
    for (const v of SEED_VENDORS) {
      const slug = slugify(v.storeName)
      const email = v.email.trim().toLowerCase()
  
      // ✅ check by slug
      const existingBySlug = await payload.find({
        collection: "vendors",
        where: { slug: { equals: slug } },
        limit: 1,
      })
  
      // ✅ ALSO check by email (this fixes your crash)
      const existingByEmail = await payload.find({
        collection: "vendors",
        where: { email: { equals: email } },
        limit: 1,
      })
  
      if (existingBySlug.totalDocs > 0 || existingByEmail.totalDocs > 0) {
        const existing = existingBySlug.totalDocs > 0
          ? existingBySlug.docs[0]
          : existingByEmail.docs[0]
  
        vendorIds.push(existing.id as string)
        console.log(`  ↩️  Reused: ${v.storeName}`)
        continue
      }
  
      const created = await payload.create({
        collection: "vendors",
        data: {
          storeName: v.storeName,
          slug,
          email, // normalized email
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
// LOAD EXISTING CATEGORIES
// Looks up your categories by slug — never creates new ones.
// Returns a map of slug → category ID.
// ─────────────────────────────────────────────────────────────────────────────

async function loadExistingCategories(): Promise<Map<string, string>> {
  console.log("\n📂 Loading existing categories...")
  const categoryMap = new Map<string, string>()

  for (const slug of EXISTING_CATEGORY_SLUGS) {
    const result = await payload.find({
      collection: "categories",
      where: { slug: { equals: slug } },
      limit: 1,
    })

    if (result.totalDocs > 0) {
      categoryMap.set(slug, result.docs[0].id as string)
      console.log(`  ✅ Found: ${slug}`)
    } else {
      console.warn(`  ⚠️  Not found in DB: "${slug}" — products mapped here will be uncategorized`)
    }
  }

  return categoryMap
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SEED
// ─────────────────────────────────────────────────────────────────────────────

async function seed() {
    console.log("🌱 Script started")
    
    try {
      await payload.init({ config })
      console.log("✅ Payload initialized")
    } catch (err) {
      console.error("❌ Payload init failed:", err)
      process.exit(1)
    }

  console.log("🌱 Starting Doma seed...\n")
  console.log(`   Dataset path   : ${DATASET_PATH}`)
  console.log(`   Images/product : ${MAX_IMAGES_PER_PRODUCT}`)
  console.log(`   Max products   : ${MAX_PRODUCTS_TOTAL}`)

  // ── Validate dataset path ───────────────────────────────────────────────
  const instancesRoot = path.join(DATASET_PATH, "instances")

  if (!fs.existsSync(instancesRoot)) {
    console.error(`\n❌ instances/ folder not found at: ${instancesRoot}`)
    process.exit(1)
  }

  // ── Gather instance folders ─────────────────────────────────────────────
  const instanceFolders = fs
    .readdirSync(instancesRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(() => Math.random() - 0.5) // shuffle for variety
    .slice(0, MAX_PRODUCTS_TOTAL)    // cap before doing any work

  console.log(`\n   Found ${instanceFolders.length} instance folders (capped at ${MAX_PRODUCTS_TOTAL})`)

  // ── Ensure vendors & categories ─────────────────────────────────────────
  const vendorIds = await ensureVendors()
  const categoryMap = await loadExistingCategories()

  // ── Seed products ───────────────────────────────────────────────────────
  console.log("\n🛋️  Seeding products...")

  let productCount = 0
  let skipCount = 0

  for (let i = 0; i < instanceFolders.length; i++) {
    const folder = instanceFolders[i]
    const folderPath = path.join(instancesRoot, folder)

    // Collect exactly MAX_IMAGES_PER_PRODUCT images (min 2)
    const images = collectImages(folderPath, MAX_IMAGES_PER_PRODUCT)

    if (images.length < 2) {
      console.log(`  ⏭️  Skipping "${folder}" — fewer than 2 images`)
      skipCount++
      continue
    }

    // Check slug uniqueness before doing expensive uploads
    const slug = slugify(folder)
    const existing = await payload.find({
      collection: "products",
      where: { slug: { equals: slug } },
      limit: 1,
    })

    if (existing.totalDocs > 0) {
      console.log(`  ⏭️  Skipping "${folder}" — slug already exists`)
      skipCount++
      continue
    }

    // Upload images
    const mediaIds: string[] = []
    for (const imgPath of images) {
      const id = await uploadImage(imgPath)
      if (id) mediaIds.push(id)
    }

    if (mediaIds.length < 2) {
      console.log(`  ⚠️  Skipping "${folder}" — not enough images uploaded successfully`)
      skipCount++
      continue
    }

    // Resolve category from folder name — falls back to "furniture" if slug
    // not found in DB (e.g. you haven't created the category yet)
    const categorySlug = resolveCategorySlug(folder)
    const categoryId = categoryMap.get(categorySlug) ?? categoryMap.get("furniture") ?? null

    // Round-robin vendor assignment
    const vendorId = vendorIds[i % vendorIds.length]

    // Build a realistic price (PKR range: 15,000 – 350,000)
    const price = Math.floor(Math.random() * 335000) + 15000

    await payload.create({
      collection: "products",
      data: {
        title: titleCase(folder),
        slug,
        Description: `${titleCase(folder)} — premium quality furniture for your home.`,
        pricing: {
          price,
        },
        inventory: {
          quantity: Math.floor(Math.random() * 50) + 5,
          lowStockThreshold: 5,
        },
        images: mediaIds.map((id) => ({
          image: id,
          alt: titleCase(folder),
        })),
        category: categoryId ?? undefined,
        vendor: vendorId,
        status: "published",
        featured: productCount < 10, // first 10 products are featured
        // Suppress 3D generation for seeded products
        model3dStatus: "none",
      },
      overrideAccess: true,
    })

    productCount++
    console.log(
      `  ✅ [${productCount}/${instanceFolders.length - skipCount}] ${titleCase(folder)} → ${categorySlug} — vendor #${(i % vendorIds.length) + 1}, ${mediaIds.length} images, ₨${price.toLocaleString()}`
    )
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log("\n─────────────────────────────────────────")
  console.log(`🎉 Seed complete!`)
  console.log(`   Products created : ${productCount}`)
  console.log(`   Products skipped : ${skipCount}`)
  console.log(`   Media uploaded   : ~${productCount * MAX_IMAGES_PER_PRODUCT}`)
  console.log(`   Vendors used     : ${Math.min(vendorIds.length, productCount)}`)
  console.log("─────────────────────────────────────────\n")
  console.log("⚠️  Remember: seed vendors were created with password 'SeedPass123!'")
  console.log("   Delete or update them before going to production.\n")

  process.exit(0)
}

seed().catch((err) => {
  console.error("\n❌ Seed failed:", err)
  process.exit(1)
})