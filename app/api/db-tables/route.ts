import { NextResponse } from "next/server";
import { getDbPool } from "../../lib/db";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await getDbPool().query(
      "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' ORDER BY table_schema, table_name;"
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Database table listing error:", error);

    return NextResponse.json(
      { success: false, message: "Could not read database tables" },
      { status: 500 }
    );
  }
}