import { NextResponse, type NextRequest } from "next/server";
import { getEcommerceDbPool } from "@/app/lib/db";
import { auth } from "@/auth";
import { verifyBankTransferTransaction } from "@/app/lib/bank-transfer-verification";
import { isValidUtr } from "@/app/lib/bank-transfer-service";

/**
 * POST /api/admin/bank-transfers/verify
 * Staff-only. Confirms or rejects a customer-submitted bank transfer (UTR).
 * Confirming uses the same transactional confirmation path as Razorpay
 * (commits inventory holds, marks order CONFIRMED / PAID).
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (session.user.role !== "staff" || !session.user.email) {
    return NextResponse.json({ error: "Staff access required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Verification payload required." }, { status: 400 });
  }

  const { orderNumber, utr, action, notes } = body as {
    orderNumber?: string;
    utr?: string;
    action?: string;
    notes?: string;
  };

  const trimmedOrderNumber = orderNumber?.trim();
  const trimmedUtr = utr?.trim().toUpperCase();

  if (!trimmedOrderNumber) {
    return NextResponse.json({ error: "orderNumber is required." }, { status: 400 });
  }
  if (action !== "confirm" && action !== "reject") {
    return NextResponse.json({ error: "action must be 'confirm' or 'reject'." }, { status: 400 });
  }
  if (action === "confirm" && !trimmedUtr) {
    return NextResponse.json({ error: "UTR is required to confirm a bank transfer." }, { status: 400 });
  }
  if (trimmedUtr && !isValidUtr(trimmedUtr)) {
    return NextResponse.json({ error: "UTR must be exactly 12 letters/numbers." }, { status: 400 });
  }

  const client = await getEcommerceDbPool().connect();
  try {
    await client.query("BEGIN");
    const result = await verifyBankTransferTransaction({
      client,
      orderNumber: trimmedOrderNumber,
      utr: trimmedUtr || "",
      staffEmail: session.user.email,
      action,
      notes: typeof notes === "string" ? notes.trim().slice(0, 500) : "",
    });

    if (!result.success) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: result.error, holdExpired: result.holdExpired === true },
        { status: result.statusCode },
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({
      success: true,
      orderNumber: trimmedOrderNumber,
      action,
      status: result.status,
      paymentStatus: result.paymentStatus,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not verify bank transfer:", error);
    return NextResponse.json({ error: "Could not verify bank transfer." }, { status: 500 });
  } finally {
    client.release();
  }
}
