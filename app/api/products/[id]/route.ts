import { NextRequest, NextResponse } from "next/server";
import { getProductBySlugFromDb } from "../../../lib/db-products";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id || id.length > 200) {
      return NextResponse.json({ error: "Product ID required" }, { status: 400 });
    }

    const product = await getProductBySlugFromDb(id);

    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json({ product });
  } catch (error) {
    console.error(`Error fetching product details:`, error);
    return NextResponse.json(
      { error: "Failed to fetch product details" },
      { status: 500 }
    );
  }
}
