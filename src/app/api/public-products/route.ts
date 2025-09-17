import { type NextRequest, NextResponse } from "next/server";
import { getPayloadClient } from "@/lib/payload-client";

// 📦 CREATE PRODUCT
export async function POST(request: NextRequest) {
  try {
    console.log("⚠️ POST /api/products received");

    const payload = await getPayloadClient();

    let body;
    try {
      body = await request.json();
    } catch (jsonError) {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const requiredFields = ["title", "price", "category", "vendor"];
    const missingFields = requiredFields.filter((f) => !body[f]);

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(", ")}` },
        { status: 400 }
      );
    }

    // 💡 Ensure category and vendor are passed as string IDs
    const data = {
      title: body.title,
      price: body.price,
      category: typeof body.category === "object" ? body.category.id : body.category,
      vendor: typeof body.vendor === "object" ? body.vendor.id : body.vendor,
      shortDescription: body.shortDescription || "",
      longDescription: body.longDescription || "",
      status: body.status || "draft",
      images: body.images || [],
      threeDModel: body.threeDModel || null,
    };

    const createdProduct = await payload.create({
      collection: "products",
      data,
    });

    console.log("✅ Product created successfully:", createdProduct.id);
    return NextResponse.json(createdProduct, { status: 201 });
  } catch (error) {
    console.error("💥 Error creating product:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// 📦 GET PRODUCTS
export async function GET(request: NextRequest) {
  try {
    console.log("🚀 GET /api/products - Starting...");

    const payload = await getPayloadClient();
    const { searchParams } = new URL(request.url);

    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const vendor = searchParams.get("vendor");
    const page = Number.parseInt(searchParams.get("page") || "1");
    const limit = Number.parseInt(searchParams.get("limit") || "12");

    const where: any = {
      status: { equals: "published" },
    };

    if (category) {
      where.category = { equals: category };
    }

    if (search) {
      where.or = [
        { title: { contains: search } },
        { shortDescription: { contains: search } },
      ];
    }

    if (vendor) {
      where.vendor = { equals: vendor };
    }

    const products = await payload.find({
      collection: "products",
      where,
      page,
      limit,
      populate: ["category", "vendor", "vendor.storeLogo", "images"],
      overrideAccess: true,
    });

    console.log("✅ Products fetched:", products.docs.length);

    return NextResponse.json(products);
  } catch (error) {
    console.error("💥 Error fetching products:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch products",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// PUT handler (update product)
export async function PUT(request: NextRequest) {
  try {
    const payload = await getPayloadClient();
    const body = await request.json();

    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: "Missing product id" }, { status: 400 });
    }

    // Optionally: check vendor ownership here

    const updatedProduct = await payload.update({
      collection: "products",
      id,
      data: updateData,
    });

    return NextResponse.json({ product: updatedProduct });
  } catch (error) {
    console.error("💥 Error updating product:", error);
    return NextResponse.json(
      { error: "Failed to update product", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// 📦 DELETE PRODUCT
export async function DELETE(request: NextRequest) {
  try {
    const payload = await getPayloadClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Missing product id" }, { status: 400 });
    }

    // Optionally: check vendor ownership here

    await payload.delete({
      collection: "products",
      id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("💥 Error deleting product:", error);
    return NextResponse.json(
      { error: "Failed to delete product", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}