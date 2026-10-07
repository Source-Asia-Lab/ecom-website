import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    const result = await pool.query(
      "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('information_schema', 'pg_catalog', 'drizzle') ORDER BY table_schema, table_name;"
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("Application table listing error:", error);

    return NextResponse.json(
      { success: false, message: "Could not read application tables" },
      { status: 500 }
    );
  }
}