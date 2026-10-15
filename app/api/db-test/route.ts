import { NextResponse } from "next/server";
import { getDbPool, getEcommerceDbPool } from "../../lib/db";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const [erpResult, ecommerceResult] = await Promise.all([
      getDbPool().query("SELECT NOW() AS current_time"),
      getEcommerceDbPool().query("SELECT NOW() AS current_time"),
    ]);

    return NextResponse.json({
      success: true,
      message: "ERP and e-commerce PostgreSQL connections successful",
      erpDatabaseTime: erpResult.rows[0].current_time,
      ecommerceDatabaseTime: ecommerceResult.rows[0].current_time,
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