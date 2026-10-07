import { NextRequest, NextResponse } from "next/server";
import { getProductsFromDb } from "../../lib/db-products";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    
    // Handle both multi-value category query parameters (category=A&category=B) and comma-separated (category=A,B)
    const categoryParams = searchParams.getAll("category");
    const category = categoryParams.join(",").trim();
    const subcategory = searchParams.get("subcategory")?.trim() || "";

    const limit = parseInt(searchParams.get("limit") || "200", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const sortBy = searchParams.get("sortBy") || "a-z";
    const inStock = searchParams.get("inStock") === "true";
    const outOfStock = searchParams.get("outOfStock") === "true";
    const minPrice = parseFloat(searchParams.get("minPrice") || "");
    const maxPrice = parseFloat(searchParams.get("maxPrice") || "");

    const data = await getProductsFromDb({
      search,
      category,
      subcategory,
      limit,
      offset,
      sortBy,
      inStock,
      outOfStock,
      minPrice,
      maxPrice,
    });

    return NextResponse.json({
      products: data.products,
      total: data.total,
      categories: data.categories,
      brands: data.brands,
    });
  } catch (error) {
    console.error("Error fetching products from database:", error);
    return NextResponse.json(
      { error: "Failed to fetch products from database", details: String(error) },
      { status: 500 }
    );
  }
}
