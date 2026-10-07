import { NextResponse } from "next/server";
import { getDbPool } from "../../lib/db";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await getDbPool().query("SELECT NOW() AS current_time");

    return NextResponse.json({
      success: true,
      message: "PostgreSQL connection successful",
      databaseTime: result.rows[0].current_time,
    });
  } catch (error) {
    console.error("Database connection error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "PostgreSQL connection failed",
      },
      { status: 500 }
    );
  }
}