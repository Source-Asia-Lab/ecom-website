import { NextResponse } from "next/server";
import { getActiveCategoriesFromDb } from "../../lib/db-products";

export async function GET() {
  try {
    const categories = await getActiveCategoriesFromDb();
    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Error fetching active categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch active categories", categories: [] },
      { status: 500 }
    );
  }
}
