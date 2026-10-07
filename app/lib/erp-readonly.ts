/**
 * ==============================================================================
 * READ-ONLY ERP ACCESS MODULE
 * ==============================================================================
 * This module provides strict READ-ONLY (SELECT query) functions to access
 * ERP products, categories, subcategories, and inventory from the PostgreSQL database.
 * 
 * SAFETY RULES ENFORCED:
 * 1. ONLY SELECT queries. No INSERT, UPDATE, DELETE, ALTER, or DROP statements.
 * 2. No hardcoded database credentials; reuses existing connection pool in app/lib/db.ts.
 * 3. Preserves original ERP schema without mutating, inventing, or relabeling data.
 * 4. Exposes client_organisation_id as-is without forcing or hardcoding organisation filters.
 * 5. Returns sale_price as-is without copying cost_price or inventing prices.
 * 6. Computes stock directly from inventory_bin_stock without mutating or reserving stock.
 */

import { query } from "./db";

export interface ErpProductRow {
  id: string;
  client_organisation_id: string | null;
  product_category_id: string | null;
  product_sub_category_id: string | null;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  product_type: string;
  cost_price: string | number | null;
  sale_price: string | number | null;
  weight: string | number | null;
  volume: string | number | null;
  unit_of_measure: string | null;
  unit_weight: string | number | null;
  hsn_sac_code: string | null;
  tax_category: string | null;
  default_gst_rate: string | number | null;
  image_url: string | null;
  is_active: boolean | null;
  lead_time_days: number | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
}

export interface ErpCategoryRow {
  id: string;
  client_organisation_id: string | null;
  name: string;
  code: string | null;
  description: string | null;
  parent_category_id: string | null;
  image_url: string | null;
  is_active: boolean | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
}

export interface ErpSubcategoryRow {
  id: string;
  client_organisation_id: string | null;
  product_category_id: string;
  name: string;
  code: string | null;
  description: string | null;
  image_url: string | null;
  is_active: boolean | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
}

export interface ErpInventorySummary {
  product_id: string;
  total_quantity: number;
}

/**
 * Reads active ERP products from public.products with optional parameterized filters.
 */
export async function getErpActiveProducts(options?: {
  limit?: number;
  offset?: number;
  search?: string;
}): Promise<ErpProductRow[]> {
  const limit = Math.min(Math.max(1, options?.limit || 200), 500);
  const offset = Math.max(0, options?.offset || 0);

  const conditions: string[] = ["is_active = true"];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (options?.search && options.search.trim()) {
    conditions.push(`(name ILIKE $${paramIndex} OR sku ILIKE $${paramIndex} OR barcode ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
    params.push(`%${options.search.trim()}%`);
    paramIndex++;
  }

  params.push(limit);
  const limitIndex = paramIndex++;
  params.push(offset);
  const offsetIndex = paramIndex++;

  const sql = `
    SELECT 
      id,
      client_organisation_id,
      product_category_id,
      product_sub_category_id,
      name,
      sku,
      barcode,
      description,
      product_type,
      cost_price,
      sale_price,
      weight,
      volume,
      unit_of_measure,
      unit_weight,
      hsn_sac_code,
      tax_category,
      default_gst_rate,
      image_url,
      is_active,
      lead_time_days,
      created_at,
      updated_at
    FROM public.products
    WHERE ${conditions.join(" AND ")}
    ORDER BY name ASC
    LIMIT $${limitIndex} OFFSET $${offsetIndex}
  `;

  const result = await query<ErpProductRow>(sql, params);
  return result.rows;
}

/**
 * Reads a single ERP product by its UUID.
 */
export async function getErpProductById(id: string): Promise<ErpProductRow | null> {
  if (!id || !id.trim()) {
    return null;
  }

  const sql = `
    SELECT 
      id,
      client_organisation_id,
      product_category_id,
      product_sub_category_id,
      name,
      sku,
      barcode,
      description,
      product_type,
      cost_price,
      sale_price,
      weight,
      volume,
      unit_of_measure,
      unit_weight,
      hsn_sac_code,
      tax_category,
      default_gst_rate,
      image_url,
      is_active,
      lead_time_days,
      created_at,
      updated_at
    FROM public.products
    WHERE id = $1 AND is_active = true
    LIMIT 1
  `;

  const result = await query<ErpProductRow>(sql, [id.trim()]);
  return result.rows[0] || null;
}

/**
 * Reads product categories from public.product_categories.
 */
export async function getErpCategories(): Promise<ErpCategoryRow[]> {
  const sql = `
    SELECT 
      id,
      client_organisation_id,
      name,
      code,
      description,
      parent_category_id,
      image_url,
      is_active,
      created_at,
      updated_at
    FROM public.product_categories
    WHERE is_active = true OR is_active IS NULL
    ORDER BY name ASC
  `;

  const result = await query<ErpCategoryRow>(sql);
  return result.rows;
}

/**
 * Reads product subcategories from public.product_sub_categories.
 */
export async function getErpSubcategories(): Promise<ErpSubcategoryRow[]> {
  const sql = `
    SELECT 
      id,
      client_organisation_id,
      product_category_id,
      name,
      code,
      description,
      image_url,
      is_active,
      created_at,
      updated_at
    FROM public.product_sub_categories
    WHERE is_active = true OR is_active IS NULL
    ORDER BY name ASC
  `;

  const result = await query<ErpSubcategoryRow>(sql);
  return result.rows;
}

/**
 * Reads inventory quantity for a product from public.inventory_bin_stock.
 */
export async function getErpProductInventory(productId: string): Promise<ErpInventorySummary> {
  if (!productId || !productId.trim()) {
    return { product_id: productId, total_quantity: 0 };
  }

  const sql = `
    SELECT product_id, COALESCE(SUM(quantity), 0) AS total_quantity
    FROM public.inventory_bin_stock
    WHERE product_id = $1
    GROUP BY product_id
  `;

  const result = await query<{ product_id: string; total_quantity: string | number }>(sql, [productId.trim()]);
  
  if (result.rows.length === 0) {
    return { product_id: productId, total_quantity: 0 };
  }

  return {
    product_id: result.rows[0].product_id,
    total_quantity: Number(result.rows[0].total_quantity) || 0,
  };
}
