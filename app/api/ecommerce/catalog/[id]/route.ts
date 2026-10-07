import { NextResponse, type NextRequest } from "next/server";
import { getPublishedEcommerceProductById } from "../../../../lib/ecommerce-catalog-service";

export async function GET(
  _request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const { id } = context.params;

    if (!id || typeof id !== "string" || !id.trim()) {
      return NextResponse.json(
        { error: "Product ID is required." },
        { status: 400 }
      );
    }

    const product = await getPublishedEcommerceProductById(id.trim());

    if (!product) {
      return NextResponse.json(
        { error: "Product not found or not published." },
        { status: 404 }
      );
    }

    return NextResponse.json(product, { status: 200 });
  } catch (error) {
    console.error("Error in GET /api/ecommerce/catalog/[id]:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while fetching the product." },
      { status: 500 }
    );
  }
}
