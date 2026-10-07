/**
 * ==============================================================================
 * ECOMMERCE CATALOG ACCESS MODULE
 * ==============================================================================
 * Reads ecommerce categories, category types, and published product catalog mappings.
 * Combines ecommerce catalog mappings with the read-only ERP product layer.
 * 
 * SAFETY RULES ENFORCED:
 * 1. ONLY SELECT queries. No INSERT, UPDATE, DELETE, or ALTER operations against ERP.
 * 2. Does NOT copy ERP product attributes into ecom_product_catalog.
 * 3. Returns published products ONLY when ecom_product_catalog.is_published = true.
 * 4. Resolves product data dynamically via app/lib/erp-readonly.ts.
 */

import { query } from "./db";
import { getErpProductById, getErpProductInventory, type ErpProductRow } from "./erp-readonly";

export interface EcomCategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface EcomCategoryTypeRow {
  id: string;
  ecom_category_id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface EcomProductCatalogRow {
  id: string;
  product_id: string;
  ecom_category_id: string;
  ecom_category_type_id: string | null;
  is_published: boolean;
  display_order: number;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface PublishedEcommerceProduct {
  catalogMapping: EcomProductCatalogRow;
  erpProduct: ErpProductRow;
  stockQuantity: number;
}

/**
 * Reads all active ecommerce categories.
 */
export async function getEcommerceCategories(): Promise<EcomCategoryRow[]> {
  const sql = `
    SELECT id, name, slug, description, image_url, is_active, display_order, created_at, updated_at
    FROM public.ecom_categories
    WHERE is_active = true
    ORDER BY display_order ASC, name ASC
  `;
  const result = await query<EcomCategoryRow>(sql);
  return result.rows;
}

/**
 * Reads active types for a specific ecommerce category.
 */
export async function getEcommerceCategoryTypes(categoryId: string): Promise<EcomCategoryTypeRow[]> {
  if (!categoryId || !categoryId.trim()) {
    return [];
  }

  const sql = `
    SELECT id, ecom_category_id, name, slug, description, image_url, is_active, display_order, created_at, updated_at
    FROM public.ecom_category_types
    WHERE ecom_category_id = $1 AND is_active = true
    ORDER BY display_order ASC, name ASC
  `;
  const result = await query<EcomCategoryTypeRow>(sql, [categoryId.trim()]);
  return result.rows;
}

/**
 * Reads all published ecommerce product mappings and joins ERP product data.
 */
export async function getPublishedEcommerceProducts(): Promise<PublishedEcommerceProduct[]> {
  const sql = `
    SELECT id, product_id, ecom_category_id, ecom_category_type_id, is_published, display_order, created_at, updated_at
    FROM public.ecom_product_catalog
    WHERE is_published = true
    ORDER BY display_order ASC, created_at DESC
  `;
  const result = await query<EcomProductCatalogRow>(sql);

  const publishedProducts: PublishedEcommerceProduct[] = [];

  for (const mapping of result.rows) {
    const erpProduct = await getErpProductById(mapping.product_id);
    if (erpProduct) {
      const inventory = await getErpProductInventory(mapping.product_id);
      publishedProducts.push({
        catalogMapping: mapping,
        erpProduct,
        stockQuantity: inventory.total_quantity,
      });
    }
  }

  return publishedProducts;
}

/**
 * Reads published products mapped to a specific ecommerce category.
 */
export async function getPublishedEcommerceProductsByCategory(categoryId: string): Promise<PublishedEcommerceProduct[]> {
  if (!categoryId || !categoryId.trim()) {
    return [];
  }

  const sql = `
    SELECT id, product_id, ecom_category_id, ecom_category_type_id, is_published, display_order, created_at, updated_at
    FROM public.ecom_product_catalog
    WHERE ecom_category_id = $1 AND is_published = true
    ORDER BY display_order ASC, created_at DESC
  `;
  const result = await query<EcomProductCatalogRow>(sql, [categoryId.trim()]);

  const publishedProducts: PublishedEcommerceProduct[] = [];

  for (const mapping of result.rows) {
    const erpProduct = await getErpProductById(mapping.product_id);
    if (erpProduct) {
      const inventory = await getErpProductInventory(mapping.product_id);
      publishedProducts.push({
        catalogMapping: mapping,
        erpProduct,
        stockQuantity: inventory.total_quantity,
      });
    }
  }

  return publishedProducts;
}

/**
 * Reads published products mapped to a specific ecommerce category type.
 */
export async function getPublishedEcommerceProductsByType(typeId: string): Promise<PublishedEcommerceProduct[]> {
  if (!typeId || !typeId.trim()) {
    return [];
  }

  const sql = `
    SELECT id, product_id, ecom_category_id, ecom_category_type_id, is_published, display_order, created_at, updated_at
    FROM public.ecom_product_catalog
    WHERE ecom_category_type_id = $1 AND is_published = true
    ORDER BY display_order ASC, created_at DESC
  `;
  const result = await query<EcomProductCatalogRow>(sql, [typeId.trim()]);

  const publishedProducts: PublishedEcommerceProduct[] = [];

  for (const mapping of result.rows) {
    const erpProduct = await getErpProductById(mapping.product_id);
    if (erpProduct) {
      const inventory = await getErpProductInventory(mapping.product_id);
      publishedProducts.push({
        catalogMapping: mapping,
        erpProduct,
        stockQuantity: inventory.total_quantity,
      });
    }
  }

  return publishedProducts;
}
