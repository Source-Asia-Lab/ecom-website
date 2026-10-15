import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { ecommerceQuery, getDbPool, getEcommerceDbPool } from "@/app/lib/db";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.user.role !== "staff") return NextResponse.json({ error: "Staff access required." }, { status: 403 });

  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 100);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200) {
    return NextResponse.json({ error: "Limit must be an integer between 1 and 200." }, { status: 400 });
  }

  try {
    const mappingResult = await ecommerceQuery<{
      product_id: string;
      is_published: boolean;
      category_id: string;
      category_name: string;
      category_is_active: boolean;
      type_name: string | null;
      type_is_active: boolean | null;
      name_override: string | null;
      description_override: string | null;
      price_override: string | number | null;
      image_url_override: string | null;
      stock_override: number | null;
    }>(
      `SELECT mapping.product_id, mapping.is_published,
              category.id AS category_id,
              category.name AS category_name,
              category.is_active AS category_is_active,
              type.name AS type_name, type.is_active AS type_is_active,
              mapping.name_override, mapping.description_override,
              mapping.price_override, mapping.image_url_override,
              mapping.stock_override
       FROM public.ecom_product_catalog mapping
       JOIN public.ecom_categories category ON category.id = mapping.ecom_category_id
       LEFT JOIN public.ecom_category_types type ON type.id = mapping.ecom_category_type_id
       ORDER BY mapping.is_published ASC, category.display_order ASC
       LIMIT $1`,
      [limit],
    );
    const productIds = mappingResult.rows.map((mapping) => mapping.product_id);
    const erpProducts = productIds.length > 0
      ? await getDbPool().query<{
          id: string;
          name: string;
          sku: string;
          sale_price: string | number | null;
          is_active: boolean | null;
        }>(
          `SELECT id, name, sku, sale_price, is_active
           FROM public.products WHERE id = ANY($1::uuid[])`,
          [productIds],
        )
      : { rows: [] };
    const erpStockResult = productIds.length > 0
      ? await getDbPool().query<{ product_id: string; stock_quantity: string | number }>(
          `SELECT product_id, SUM(quantity) as stock_quantity
           FROM public.inventory_bin_stock WHERE product_id = ANY($1::uuid[])
           GROUP BY product_id`,
          [productIds],
        )
      : { rows: [] };
    const erpStockById = new Map(erpStockResult.rows.map((r) => [r.product_id, Number(r.stock_quantity) || 0]));
    const erpProductsById = new Map(erpProducts.rows.map((product) => [product.id, product]));
    const products = mappingResult.rows.flatMap((mapping) => {
      const product = erpProductsById.get(mapping.product_id);
      const erpStock = erpStockById.get(mapping.product_id) || 0;
      const effectiveStock = mapping.stock_override !== null && mapping.stock_override !== undefined
        ? Number(mapping.stock_override)
        : erpStock;
      return product
        ? [{
            product_id: product.id,
            name: product.name,
            sku: product.sku,
            sale_price: product.sale_price,
            is_published: mapping.is_published,
            category_id: mapping.category_id,
            category_name: mapping.category_name,
            category_is_active: mapping.category_is_active,
            type_name: mapping.type_name,
            type_is_active: mapping.type_is_active,
            name_override: mapping.name_override,
            description_override: mapping.description_override,
            price_override: mapping.price_override,
            image_url_override: mapping.image_url_override,
            stock_override: mapping.stock_override,
            erp_stock: erpStock,
            effective_stock: effectiveStock,
            product_is_active: Boolean(product.is_active),
          }]
        : [];
    });
    const [categoriesResult, allMappingsResult] = await Promise.all([
      ecommerceQuery<{ id: string; name: string }>(
        `SELECT id, name FROM public.ecom_categories
         WHERE is_active = true ORDER BY display_order, name`,
      ),
      ecommerceQuery<{ product_id: string }>(
        "SELECT product_id FROM public.ecom_product_catalog",
      ),
    ]);
    const allMappedProductIds = allMappingsResult.rows.map((mapping) => mapping.product_id);
    const availableResult = await getDbPool().query<{ id: string; name: string; sku: string }>(
      `SELECT id, name, sku FROM public.products
       WHERE is_active = true AND NOT (id = ANY($1::uuid[]))
       ORDER BY name ASC LIMIT $2`,
      [allMappedProductIds, limit],
    );
    return NextResponse.json(
      {
        products,
        categories: categoriesResult.rows,
        availableProducts: availableResult.rows.map((product) => ({
          productId: product.id,
          name: product.name,
          sku: product.sku,
        })),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Could not load staff catalog:", error);
    return NextResponse.json({ error: "Could not load catalog mappings." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.user.role !== "staff" || !session.user.email) {
    return NextResponse.json({ error: "Staff access required." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (
    !body || typeof body !== "object" ||
    !("productId" in body) || typeof body.productId !== "string" || !UUID_PATTERN.test(body.productId) ||
    !("categoryId" in body) || typeof body.categoryId !== "string" || !UUID_PATTERN.test(body.categoryId) ||
    ("categoryTypeId" in body && body.categoryTypeId !== null &&
      (typeof body.categoryTypeId !== "string" || !UUID_PATTERN.test(body.categoryTypeId))) ||
    ("displayOrder" in body &&
      (typeof body.displayOrder !== "number" || !Number.isSafeInteger(body.displayOrder) ||
        body.displayOrder < 0 || body.displayOrder > 1_000_000))
  ) {
    return NextResponse.json(
      { error: "Provide valid ERP product, e-commerce category, optional category type, and display order values." },
      { status: 400 },
    );
  }

  const productId = body.productId;
  const categoryId = body.categoryId;
  const categoryTypeId = "categoryTypeId" in body ? body.categoryTypeId : null;
  const displayOrder = "displayOrder" in body ? body.displayOrder : 0;

  try {
    const erpProduct = await getDbPool().query(
      "SELECT 1 FROM public.products WHERE id = $1 AND is_active = true",
      [productId],
    );
    if (erpProduct.rowCount !== 1) {
      return NextResponse.json({ error: "Choose an active product from the ERP product list." }, { status: 404 });
    }

    const client = await getEcommerceDbPool().connect();
    try {
      await client.query("BEGIN");
      const category = await client.query<{ is_active: boolean }>(
        "SELECT is_active FROM public.ecom_categories WHERE id = $1",
        [categoryId],
      );
      if (!category.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "E-commerce category not found." }, { status: 404 });
      }
      if (categoryTypeId) {
        const categoryType = await client.query(
          `SELECT 1 FROM public.ecom_category_types
           WHERE id = $1 AND ecom_category_id = $2`,
          [categoryTypeId, categoryId],
        );
        if (categoryType.rowCount !== 1) {
          await client.query("ROLLBACK");
          return NextResponse.json({ error: "Category type must belong to the selected category." }, { status: 400 });
        }
      }

      const result = await client.query<{ id: string }>(
        `INSERT INTO public.ecom_product_catalog
           (product_id, ecom_category_id, ecom_category_type_id, display_order)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (product_id) DO NOTHING
         RETURNING id`,
        [productId, categoryId, categoryTypeId, displayOrder],
      );
      if (!result.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "This ERP product already has an e-commerce catalog entry." }, { status: 409 });
      }
      await client.query(
        `INSERT INTO public.ecom_audit_log (actor_email, action, entity_type, entity_id, after_data)
         VALUES ($1, 'CREATE', 'CATALOG_PRODUCT', $2, $3::jsonb)`,
        [
          session.user.email,
          productId,
          JSON.stringify({ categoryId, categoryTypeId, displayOrder, isPublished: false }),
        ],
      );
      await client.query("COMMIT");
      return NextResponse.json({ productId, isPublished: false }, { status: 201 });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Could not create e-commerce catalog entry:", error);
    return NextResponse.json({ error: "Could not create catalog entry." }, { status: 500 });
  }
}