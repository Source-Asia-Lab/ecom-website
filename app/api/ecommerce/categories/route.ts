import { NextResponse } from "next/server";
import { getPublishedEcommerceCategories } from "../../../lib/ecommerce-catalog-service";

export async function GET() {
  try {
    const categories = await getPublishedEcommerceCategories();
    return NextResponse.json({ categories, total: categories.length }, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/ecommerce/categories:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while fetching categories." },
      { status: 500 }
    );
  }
}
