import { NextResponse, type NextRequest } from "next/server";
import { getPublishedEcommerceCategoryTypes } from "../../../../../lib/ecommerce-catalog-service";

export async function GET(
  _request: NextRequest,
  context: { params: { categoryId: string } }
) {
  try {
    const { categoryId } = context.params;

    if (!categoryId || typeof categoryId !== "string" || !categoryId.trim()) {
      return NextResponse.json(
        { error: "Category ID is required." },
        { status: 400 }
      );
    }

    const types = await getPublishedEcommerceCategoryTypes(categoryId.trim());

    return NextResponse.json({ types, total: types.length }, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/ecommerce/categories/[categoryId]/types:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while fetching category types." },
      { status: 500 }
    );
  }
}
