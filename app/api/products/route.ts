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

    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");
    const limit = limitParam === null ? 200 : Number(limitParam);
    const offset = offsetParam === null ? 0 : Number(offsetParam);
    const sortBy = searchParams.get("sortBy") || "a-z";
    const inStock = searchParams.get("inStock") === "true";
    const outOfStock = searchParams.get("outOfStock") === "true";
    const minPriceParam = searchParams.get("minPrice");
    const maxPriceParam = searchParams.get("maxPrice");
    const minPrice = minPriceParam ? Number(minPriceParam) : Number.NaN;
    const maxPrice = maxPriceParam ? Number(maxPriceParam) : Number.NaN;
    const validSortOrders = ["a-z", "z-a", "price-asc", "price-desc"];

    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
      return NextResponse.json({ error: "Limit must be an integer between 1 and 200." }, { status: 400 });
    }
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) {
      return NextResponse.json({ error: "Offset must be an integer between 0 and 1000000." }, { status: 400 });
    }
    if (search.length > 100 || category.length > 200 || subcategory.length > 100) {
      return NextResponse.json({ error: "Search and filter values are too long." }, { status: 400 });
    }
    if (!validSortOrders.includes(sortBy)) {
      return NextResponse.json({ error: "Unsupported sort order." }, { status: 400 });
    }
    if (
      (minPriceParam !== null && (!Number.isFinite(minPrice) || minPrice < 0 || minPrice > 100_000_000)) ||
      (maxPriceParam !== null && (!Number.isFinite(maxPrice) || maxPrice < 0 || maxPrice > 100_000_000)) ||
      (Number.isFinite(minPrice) && Number.isFinite(maxPrice) && minPrice > maxPrice)
    ) {
      return NextResponse.json({ error: "Price filters are invalid." }, { status: 400 });
    }

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
      { error: "Failed to fetch products." },
      { status: 500 }
    );
  }
}
