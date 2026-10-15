import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { getEcommerceDbPool, query } from "@/app/lib/db";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ productId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.user.role !== "staff" || !session.user.email) {
    return NextResponse.json({ error: "Staff access required." }, { status: 403 });
  }

  const { productId } = await context.params;
  if (!UUID_PATTERN.test(productId)) {
    return NextResponse.json({ error: "Product ID is invalid." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!isRecord(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const hasPublication = "isPublished" in body;
  const hasCategory = "categoryId" in body;
  const hasCategoryType = "categoryTypeId" in body;
  const hasDisplayOrder = "displayOrder" in body;
  const hasNameOverride = "nameOverride" in body;
  const hasDescriptionOverride = "descriptionOverride" in body;
  const hasPriceOverride = "priceOverride" in body;
  const hasImageUrlOverride = "imageUrlOverride" in body;
  const hasStockOverride = "stockOverride" in body;
  if (
    (!hasPublication && !hasCategory && !hasCategoryType && !hasDisplayOrder &&
      !hasNameOverride && !hasDescriptionOverride && !hasPriceOverride && !hasImageUrlOverride && !hasStockOverride) ||
    (hasPublication && typeof body.isPublished !== "boolean") ||
    (hasCategory && (typeof body.categoryId !== "string" || !UUID_PATTERN.test(body.categoryId))) ||
    (hasCategoryType && body.categoryTypeId !== null &&
      (typeof body.categoryTypeId !== "string" || !UUID_PATTERN.test(body.categoryTypeId))) ||
    (hasDisplayOrder &&
      (typeof body.displayOrder !== "number" || !Number.isSafeInteger(body.displayOrder) ||
        body.displayOrder < 0 || body.displayOrder > 1_000_000)) ||
    (hasNameOverride && body.nameOverride !== null &&
      (typeof body.nameOverride !== "string" || !body.nameOverride.trim() || body.nameOverride.length > 250)) ||
    (hasDescriptionOverride && body.descriptionOverride !== null &&
      (typeof body.descriptionOverride !== "string" || !body.descriptionOverride.trim() ||
        body.descriptionOverride.length > 10_000)) ||
    (hasPriceOverride && body.priceOverride !== null &&
      (typeof body.priceOverride !== "number" || !Number.isFinite(body.priceOverride) ||
        body.priceOverride < 0 || body.priceOverride > 100_000_000 ||
        Math.round(body.priceOverride * 100) !== body.priceOverride * 100)) ||
    (hasImageUrlOverride && body.imageUrlOverride !== null &&
      (typeof body.imageUrlOverride !== "string" || !body.imageUrlOverride.trim() ||
        body.imageUrlOverride.length > 2048)) ||
    (hasStockOverride && body.stockOverride !== null &&
      (typeof body.stockOverride !== "number" || !Number.isInteger(body.stockOverride) ||
        body.stockOverride < 0 || body.stockOverride > 1_000_000))
  ) {
    return NextResponse.json(
      { error: "Catalog update values are invalid." },
      { status: 400 },
    );
  }

  const client = await getEcommerceDbPool().connect();
  try {
    await client.query("BEGIN");
    const mappingResult = await client.query<{
      id: string;
      is_published: boolean;
      ecom_category_id: string;
      ecom_category_type_id: string | null;
      display_order: number;
      name_override: string | null;
      description_override: string | null;
      price_override: string | number | null;
      image_url_override: string | null;
      stock_override: number | null;
    }>(
      `SELECT id, is_published, ecom_category_id, ecom_category_type_id, display_order,
              name_override, description_override, price_override, image_url_override,
              stock_override
       FROM public.ecom_product_catalog WHERE product_id = $1 FOR UPDATE`,
      [productId],
    );
    const mapping = mappingResult.rows[0];
    if (!mapping) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Catalog entry not found." }, { status: 404 });
    }

    const categoryId = typeof body.categoryId === "string" ? body.categoryId : mapping.ecom_category_id;
    const categoryTypeId = hasCategoryType
      ? typeof body.categoryTypeId === "string" || body.categoryTypeId === null
        ? body.categoryTypeId
        : mapping.ecom_category_type_id
      : hasCategory && body.categoryId !== mapping.ecom_category_id
        ? null
        : mapping.ecom_category_type_id;
    const isPublished = typeof body.isPublished === "boolean" ? body.isPublished : mapping.is_published;
    const displayOrder = typeof body.displayOrder === "number" ? body.displayOrder : mapping.display_order;
    const nameOverride = hasNameOverride
      ? typeof body.nameOverride === "string" ? body.nameOverride.trim() : null
      : mapping.name_override;
    const descriptionOverride = hasDescriptionOverride
      ? typeof body.descriptionOverride === "string" ? body.descriptionOverride.trim() : null
      : mapping.description_override;
    const priceOverride = hasPriceOverride
      ? typeof body.priceOverride === "number" ? body.priceOverride : null
      : mapping.price_override;
    const imageUrlOverride = hasImageUrlOverride
      ? typeof body.imageUrlOverride === "string" ? body.imageUrlOverride.trim() : null
      : mapping.image_url_override;
    const stockOverride = hasStockOverride
      ? typeof body.stockOverride === "number" ? body.stockOverride : null
      : mapping.stock_override;

    const category = await client.query<{ is_active: boolean }>(
      "SELECT is_active FROM public.ecom_categories WHERE id = $1",
      [categoryId],
    );
    if (!category.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "E-commerce category not found." }, { status: 404 });
    }
    if (categoryTypeId) {
      const type = await client.query<{ is_active: boolean }>(
        `SELECT is_active FROM public.ecom_category_types
         WHERE id = $1 AND ecom_category_id = $2`,
        [categoryTypeId, categoryId],
      );
      if (!type.rows[0]) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Category type must belong to the selected category." }, { status: 400 });
      }
      if (isPublished && !type.rows[0].is_active) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "The mapped category type must be active before publication." }, { status: 409 });
      }
    }
    if (isPublished && !category.rows[0].is_active) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "The mapped category must be active before publication." }, { status: 409 });
    }
    if (isPublished) {
      const product = await query(
        "SELECT 1 FROM public.products WHERE id = $1 AND is_active = true",
        [productId],
      );
      if (product.rowCount !== 1) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Only active ERP products can be published." }, { status: 409 });
      }
    }

    await client.query(
      `UPDATE public.ecom_product_catalog
       SET ecom_category_id = $2, ecom_category_type_id = $3,
           is_published = $4, display_order = $5,
           name_override = $6, description_override = $7,
           price_override = $8, image_url_override = $9,
           stock_override = $10, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        mapping.id, categoryId, categoryTypeId, isPublished, displayOrder,
        nameOverride, descriptionOverride, priceOverride, imageUrlOverride,
        stockOverride,
      ],
    );
    await client.query(
      `INSERT INTO public.ecom_audit_log (actor_email, action, entity_type, entity_id, before_data, after_data)
       VALUES ($1, 'UPDATE', 'CATALOG_PRODUCT', $2, $3::jsonb, $4::jsonb)`,
      [
        session.user.email,
        productId,
        JSON.stringify({
          categoryId: mapping.ecom_category_id,
          categoryTypeId: mapping.ecom_category_type_id,
          isPublished: mapping.is_published,
          displayOrder: mapping.display_order,
          nameOverride: mapping.name_override,
          descriptionOverride: mapping.description_override,
          priceOverride: mapping.price_override,
          imageUrlOverride: mapping.image_url_override,
          stockOverride: mapping.stock_override,
        }),
        JSON.stringify({
          categoryId, categoryTypeId, isPublished, displayOrder,
          nameOverride, descriptionOverride, priceOverride, imageUrlOverride,
          stockOverride,
        }),
      ],
    );
    await client.query("COMMIT");
    return NextResponse.json({
      productId, categoryId, categoryTypeId, isPublished, displayOrder,
      nameOverride, descriptionOverride, priceOverride, imageUrlOverride,
      stockOverride,
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not update product publication:", error);
    return NextResponse.json({ error: "Could not update catalog publication." }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ productId: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (session.user.role !== "staff" || !session.user.email) {
    return NextResponse.json({ error: "Staff access required." }, { status: 403 });
  }

  const { productId } = await context.params;
  if (!UUID_PATTERN.test(productId)) {
    return NextResponse.json({ error: "Product ID is invalid." }, { status: 400 });
  }

  const client = await getEcommerceDbPool().connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      id: string;
      ecom_category_id: string;
      ecom_category_type_id: string | null;
      is_published: boolean;
      display_order: number;
      name_override: string | null;
      description_override: string | null;
      price_override: string | number | null;
      image_url_override: string | null;
    }>(
      `DELETE FROM public.ecom_product_catalog
       WHERE product_id = $1
       RETURNING id, ecom_category_id, ecom_category_type_id, is_published, display_order,
                 name_override, description_override, price_override, image_url_override`,
      [productId],
    );
    const mapping = result.rows[0];
    if (!mapping) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Catalog entry not found." }, { status: 404 });
    }
    await client.query(
      `INSERT INTO public.ecom_audit_log (actor_email, action, entity_type, entity_id, before_data)
       VALUES ($1, 'DELETE', 'CATALOG_PRODUCT', $2, $3::jsonb)`,
      [
        session.user.email,
        productId,
        JSON.stringify({
          categoryId: mapping.ecom_category_id,
          categoryTypeId: mapping.ecom_category_type_id,
          isPublished: mapping.is_published,
          displayOrder: mapping.display_order,
          nameOverride: mapping.name_override,
          descriptionOverride: mapping.description_override,
          priceOverride: mapping.price_override,
          imageUrlOverride: mapping.image_url_override,
        }),
      ],
    );
    await client.query("COMMIT");
    return NextResponse.json({ productId, deleted: true });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Could not delete e-commerce catalog entry:", error);
    return NextResponse.json({ error: "Could not delete catalog entry." }, { status: 500 });
  } finally {
    client.release();
  }
}