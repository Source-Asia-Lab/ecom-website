import { auth } from "@/auth";
import { getDbPool, getEcommerceDbPool } from "../../lib/db";
import { createOrderRequestHandler } from "../../lib/order-request-service";

export const POST = createOrderRequestHandler({
  getEcommercePool: getEcommerceDbPool,
  getProductPool: getDbPool,
  getAuthenticatedEmail: async () => (await auth())?.user?.email || null,
});
