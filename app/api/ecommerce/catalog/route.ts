import { NextResponse, type NextRequest } from "next/server";
import { getPublishedEcommerceProducts } from "../../../lib/ecommerce-catalog-service";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const categoryId = searchParams.get("categoryId") || searchParams.get("category") || undefined;
    const typeId = searchParams.get("typeId") || searchParams.get("type") || undefined;
    const search = searchParams.get("search") || undefined;
    
    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");

    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    const offset = offsetParam ? parseInt(offsetParam, 10) : undefined;

    if (limit !== undefined && (isNaN(limit) || limit < 1)) {
      return NextResponse.json(
        { error: "Invalid limit parameter. Must be a positive integer." },
        { status: 400 }
      );
    }

    if (offset !== undefined && (isNaN(offset) || offset < 0)) {
      return NextResponse.json(
        { error: "Invalid offset parameter. Must be a non-negative integer." },
        { status: 400 }
      );
    }

    const result = await getPublishedEcommerceProducts({
      categoryId,
      typeId,
      search,
      limit,
      offset,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/ecommerce/catalog:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while fetching the catalog." },
      { status: 500 }
    );
  }
}
