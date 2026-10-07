import { NextResponse, type NextRequest } from "next/server";
import { getPublishedEcommerceProducts } from "../../../lib/ecommerce-catalog-service";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const categoryId = searchParams.get("categoryId") || searchParams.get("category") || undefined;
    const typeId = searchParams.get("typeId") || searchParams.get("type") || undefined;
    const search = searchParams.get("search") || undefined;

    const limitParam = searchParams.get("limit");
    const offsetParam = searchParams.get("offset");

    const limit = limitParam === null ? undefined : Number(limitParam);
    const offset = offsetParam === null ? undefined : Number(offsetParam);

    if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)) {
      return NextResponse.json(
        { error: "Invalid limit parameter. Must be an integer between 1 and 200." },
        { status: 400 }
      );
    }

    if (offset !== undefined && (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000)) {
      return NextResponse.json(
        { error: "Invalid offset parameter. Must be an integer between 0 and 1000000." },
        { status: 400 }
      );
    }
    if (
      search !== undefined && search.length > 100 ||
      categoryId !== undefined && !UUID_PATTERN.test(categoryId) ||
      typeId !== undefined && !UUID_PATTERN.test(typeId)
    ) {
      return NextResponse.json({ error: "One or more catalog filters are invalid." }, { status: 400 });
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
