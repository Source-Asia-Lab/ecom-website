/**
 * ==============================================================================
 * SERVER-SIDE ECOMMERCE CATALOG SERVICE
 * ==============================================================================
 * Combines ecommerce catalog mappings (ecom_product_catalog, ecom_categories,
 * ecom_category_types) with the read-only ERP product and inventory layers.
 * 
 * GATEKEEPER RULE:
 * Products are ONLY returned if:
 * 1. An explicit ecom_product_catalog mapping exists.
 * 2. ecom_product_catalog.is_published = TRUE.
 * 3. The corresponding ERP product exists in public.products.
 * 4. The ERP product is active (products.is_active = TRUE).
 */

import { query } from "./db";
import { getErpProductById, getErpProductInventory, type ErpProductRow } from "./erp-readonly";

export interface EcommerceCategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface EcommerceCategoryTypeRef {
  id: string;
  name: string;
  slug: string;
}

export interface EcommerceCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface EcommerceCategoryType {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export type ProductAvailability = "in_stock" | "low_stock" | "out_of_stock";

export interface PublishedEcommerceProductResponse {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  category: EcommerceCategoryRef | null;
  type: EcommerceCategoryTypeRef | null;
  price: number | null;
  isPriceOnRequest: boolean;
  stockQuantity: number;
  availability: ProductAvailability;
  imageUrl: string | null;
  productType: string;
  weight: number | null;
  volume: number | null;
  unitOfMeasure: string | null;
  unitWeight: number | null;
  leadTimeDays: number | null;
  isActive: boolean;
  isPublished: boolean;
}

function calculateAvailability(quantity: number): ProductAvailability {
  if (!quantity || quantity <= 0) {
    return "out_of_stock";
  }
  return quantity <= 100 ? "low_stock" : "in_stock";
}

function mapToPublishedProductResponse(
  erpProduct: ErpProductRow,
  catRef: EcommerceCategoryRef | null,
  typeRef: EcommerceCategoryTypeRef | null,
  stockQty: number,
  isPublished: boolean
): PublishedEcommerceProductResponse {
  const numericSalePrice = erpProduct.sale_price !== null && erpProduct.sale_price !== undefined
    ? Number(erpProduct.sale_price)
    : 0;

  const hasValidPrice = Number.isFinite(numericSalePrice) && numericSalePrice > 0;
  const price = hasValidPrice ? numericSalePrice : null;
  const isPriceOnRequest = !hasValidPrice;

  return {
    id: erpProduct.id,
    name: erpProduct.name,
    sku: erpProduct.sku,
    barcode: erpProduct.barcode,
    description: erpProduct.description,
    category: catRef,
    type: typeRef,
    price,
    isPriceOnRequest,
    stockQuantity: Math.max(0, stockQty),
    availability: calculateAvailability(stockQty),
    imageUrl: erpProduct.image_url,
    productType: erpProduct.product_type,
    weight: erpProduct.weight !== null ? Number(erpProduct.weight) : null,
    volume: erpProduct.volume !== null ? Number(erpProduct.volume) : null,
    unitOfMeasure: erpProduct.unit_of_measure,
    unitWeight: erpProduct.unit_weight !== null ? Number(erpProduct.unit_weight) : null,
    leadTimeDays: erpProduct.lead_time_days,
    isActive: Boolean(erpProduct.is_active),
    isPublished,
  };
}

/**
 * Returns all published ecommerce products (is_published = TRUE).
 */
export async function getPublishedEcommerceProducts(options?: {
  categoryId?: string;
  typeId?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ products: PublishedEcommerceProductResponse[]; total: number }> {
  const limit = Math.min(Math.max(1, options?.limit || 50), 200);
  const offset = Math.max(0, options?.offset || 0);

  const conditions: string[] = ["m.is_published = true"];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (options?.categoryId && options.categoryId.trim()) {
    conditions.push(`m.ecom_category_id = $${paramIndex}`);
    params.push(options.categoryId.trim());
    paramIndex++;
  }

  if (options?.typeId && options.typeId.trim()) {
    conditions.push(`m.ecom_category_type_id = $${paramIndex}`);
    params.push(options.typeId.trim());
    paramIndex++;
  }

  const sql = `
    SELECT 
      m.id AS mapping_id,
      m.product_id,
      m.ecom_category_id,
      m.ecom_category_type_id,
      m.is_published,
      c.id AS category_id,
      c.name AS category_name,
      c.slug AS category_slug,
      t.id AS type_id,
      t.name AS type_name,
      t.slug AS type_slug
    FROM public.ecom_product_catalog m
    JOIN public.ecom_categories c ON c.id = m.ecom_category_id
    LEFT JOIN public.ecom_category_types t ON t.id = m.ecom_category_type_id
    WHERE ${conditions.join(" AND ")}
    ORDER BY m.display_order ASC, m.created_at DESC
  `;

  const result = await query<{
    mapping_id: string;
    product_id: string;
    ecom_category_id: string;
    ecom_category_type_id: string | null;
    is_published: boolean;
    category_id: string;
    category_name: string;
    category_slug: string;
    type_id: string | null;
    type_name: string | null;
    type_slug: string | null;
  }>(sql, params);

  const productsList: PublishedEcommerceProductResponse[] = [];

  for (const row of result.rows) {
    const erpProduct = await getErpProductById(row.product_id);
    if (!erpProduct || !erpProduct.is_active) {
      continue;
    }

    if (options?.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      const match =
        erpProduct.name.toLowerCase().includes(q) ||
        erpProduct.sku.toLowerCase().includes(q) ||
        (erpProduct.barcode && erpProduct.barcode.toLowerCase().includes(q)) ||
        (erpProduct.description && erpProduct.description.toLowerCase().includes(q));

      if (!match) {
        continue;
      }
    }

    const inventory = await getErpProductInventory(row.product_id);

    const catRef: EcommerceCategoryRef = {
      id: row.category_id,
      name: row.category_name,
      slug: row.category_slug,
    };

    const typeRef: EcommerceCategoryTypeRef | null = row.type_id && row.type_name && row.type_slug
      ? { id: row.type_id, name: row.type_name, slug: row.type_slug }
      : null;

    productsList.push(
      mapToPublishedProductResponse(
        erpProduct,
        catRef,
        typeRef,
        inventory.total_quantity,
        row.is_published
      )
    );
  }

  const total = productsList.length;
  const paginated = productsList.slice(offset, offset + limit);

  return { products: paginated, total };
}

/**
 * Returns a published ecommerce product by ERP Product UUID.
 * Returns null if mapping does not exist, is_published = FALSE, or ERP product is inactive.
 */
export async function getPublishedEcommerceProductById(productId: string): Promise<PublishedEcommerceProductResponse | null> {
  if (!productId || !productId.trim()) {
    return null;
  }

  const sql = `
    SELECT 
      m.id AS mapping_id,
      m.product_id,
      m.ecom_category_id,
      m.ecom_category_type_id,
      m.is_published,
      c.id AS category_id,
      c.name AS category_name,
      c.slug AS category_slug,
      t.id AS type_id,
      t.name AS type_name,
      t.slug AS type_slug
    FROM public.ecom_product_catalog m
    JOIN public.ecom_categories c ON c.id = m.ecom_category_id
    LEFT JOIN public.ecom_category_types t ON t.id = m.ecom_category_type_id
    WHERE m.product_id = $1 AND m.is_published = true
    LIMIT 1
  `;

  const result = await query<{
    mapping_id: string;
    product_id: string;
    ecom_category_id: string;
    ecom_category_type_id: string | null;
    is_published: boolean;
    category_id: string;
    category_name: string;
    category_slug: string;
    type_id: string | null;
    type_name: string | null;
    type_slug: string | null;
  }>(sql, [productId.trim()]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const erpProduct = await getErpProductById(row.product_id);
  if (!erpProduct || !erpProduct.is_active) {
    return null;
  }

  const inventory = await getErpProductInventory(row.product_id);

  const catRef: EcommerceCategoryRef = {
    id: row.category_id,
    name: row.category_name,
    slug: row.category_slug,
  };

  const typeRef: EcommerceCategoryTypeRef | null = row.type_id && row.type_name && row.type_slug
    ? { id: row.type_id, name: row.type_name, slug: row.type_slug }
    : null;

  return mapToPublishedProductResponse(
    erpProduct,
    catRef,
    typeRef,
    inventory.total_quantity,
    row.is_published
  );
}

/**
 * Returns active ecommerce categories.
 */
export async function getPublishedEcommerceCategories(): Promise<EcommerceCategory[]> {
  const sql = `
    SELECT 
      id,
      name,
      slug,
      description,
      image_url AS "imageUrl",
      is_active AS "isActive",
      display_order AS "displayOrder",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM public.ecom_categories
    WHERE is_active = true
    ORDER BY display_order ASC, name ASC
  `;

  const result = await query<EcommerceCategory>(sql);
  return result.rows;
}

/**
 * Returns active ecommerce category types for a specified category ID.
 */
export async function getPublishedEcommerceCategoryTypes(categoryId: string): Promise<EcommerceCategoryType[]> {
  if (!categoryId || !categoryId.trim()) {
    return [];
  }

  const sql = `
    SELECT 
      id,
      ecom_category_id AS "categoryId",
      name,
      slug,
      description,
      image_url AS "imageUrl",
      is_active AS "isActive",
      display_order AS "displayOrder",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM public.ecom_category_types
    WHERE ecom_category_id = $1 AND is_active = true
    ORDER BY display_order ASC, name ASC
  `;

  const result = await query<EcommerceCategoryType>(sql, [categoryId.trim()]);
  return result.rows;
}
