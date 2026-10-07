import { query, mapDbRowToProduct, DbProductRow } from "./db";
import type { Product } from "../store/products";
import { applyDevStorefrontMetadata } from "./dev-storefront-metadata";
import {
  ECOMMERCE_CATEGORY_NAMES,
  getEcommerceProductTaxonomy,
} from "../store/category-taxonomy";

export const DEFAULT_ACTIVE_CATEGORIES = ECOMMERCE_CATEGORY_NAMES;

const DEVELOPMENT_PRODUCT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getDevelopmentProductIds(): string[] | null {
  const configuredIds = process.env.DEV_STOREFRONT_PRODUCT_IDS;
  if (!configuredIds) return null;

  const ids = configuredIds.split(",").map((id) => id.trim());
  if (
    ids.length !== 7 ||
    ids.some((id) => !DEVELOPMENT_PRODUCT_ID_PATTERN.test(id)) ||
    new Set(ids).size !== ids.length
  ) {
    return null;
  }

  return ids;
}

function getDevelopmentProductSkus(): string[] | null {
  const configuredSkus = process.env.DEV_STOREFRONT_PRODUCT_SKUS;
  if (!configuredSkus) return null;

  const skus = configuredSkus.split(",").map((sku) => sku.trim());
  if (skus.length !== 7 || skus.some((sku) => !sku) || new Set(skus).size !== skus.length) {
    return null;
  }

  return skus;
}

function applyEcommerceTaxonomy(product: Product): Product {
  const taxonomy = getEcommerceProductTaxonomy(product.id, product.sku);
  return taxonomy
    ? { ...product, category: taxonomy.category, subcategory: taxonomy.subcategory }
    : product;
}

export async function getActiveCategoriesFromDb(): Promise<string[]> {
  return [...DEFAULT_ACTIVE_CATEGORIES];
}

export async function getProductsFromDb(options?: {
  search?: string;
  category?: string;
  subcategory?: string;
  productType?: string;
  unitOfMeasure?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
  inStock?: boolean;
  outOfStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
}): Promise<{ products: Product[]; total: number; categories: string[]; brands: string[] }> {
  try {
    const search = options?.search?.trim() || "";
    const rawCategory = options?.category?.trim() || "";
    const subcategory = options?.subcategory?.trim() || "";
    const productType = options?.productType?.trim() || "";
    const unitOfMeasure = options?.unitOfMeasure?.trim() || "";
    const limit = Math.min(Math.max(1, options?.limit || 200), 500);
    const offset = Math.max(0, options?.offset || 0);
    const sortBy = options?.sortBy || "a-z";
    const developmentProductIds =
      process.env.NODE_ENV === "development" ? getDevelopmentProductIds() : null;
    const developmentProductSkus =
      process.env.NODE_ENV === "development" ? getDevelopmentProductSkus() : null;

    if (process.env.NODE_ENV === "development" && (!developmentProductIds || !developmentProductSkus)) {
      console.error("Development product allowlist is missing or invalid.");
      return { products: [], total: 0, categories: DEFAULT_ACTIVE_CATEGORIES, brands: [] };
    }

    const conditions: string[] = ["p.is_active = true"];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (developmentProductIds) {
      conditions.push(
        `(p.id = ANY($${paramIndex}::uuid[]) OR p.sku = ANY($${paramIndex + 1}::text[]))`
      );
      params.push(developmentProductIds);
      params.push(developmentProductSkus);
      paramIndex += 2;
    }

    // Search by name, sku, barcode, description
    if (search) {
      conditions.push(
        `(p.name ILIKE $${paramIndex} OR p.sku ILIKE $${paramIndex} OR p.barcode ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`
      );
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (productType) {
      conditions.push(`p.product_type = $${paramIndex}`);
      params.push(productType);
      paramIndex++;
    }

    if (unitOfMeasure) {
      conditions.push(`p.unit_of_measure = $${paramIndex}`);
      params.push(unitOfMeasure);
      paramIndex++;
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    let orderBy = "p.name ASC";
    if (sortBy === "z-a") orderBy = "p.name DESC";
    else if (sortBy === "price-asc") orderBy = "(CASE WHEN CAST(p.sale_price AS numeric) > 0 THEN CAST(p.sale_price AS numeric) WHEN CAST(p.cost_price AS numeric) > 0 THEN CAST(p.cost_price AS numeric) ELSE 9999999 END) ASC, p.name ASC";
    else if (sortBy === "price-desc") orderBy = "(CASE WHEN CAST(p.sale_price AS numeric) > 0 THEN CAST(p.sale_price AS numeric) ELSE CAST(p.cost_price AS numeric) END) DESC, p.name ASC";

    const selectSql = `
      SELECT p.*, c.name as category_name, COALESCE(ibs.stock_quantity, 0) as stock_quantity
      FROM public.products p
      LEFT JOIN public.product_categories c ON p.product_category_id = c.id
      LEFT JOIN (
        SELECT product_id, SUM(quantity) as stock_quantity
        FROM public.inventory_bin_stock
        GROUP BY product_id
      ) ibs ON p.id = ibs.product_id
      ${whereClause}
      ORDER BY ${orderBy}
    `;
    const res = await query<DbProductRow>(selectSql, params);
    let allProducts = res.rows.map((row) =>
      applyEcommerceTaxonomy(
        applyDevStorefrontMetadata(mapDbRowToProduct(row))
      )
    );

    // 1. Filter by category (OR logic if multiple comma-separated categories)
    const categoryList = rawCategory
      ? rawCategory.split(",").map((c) => c.trim().toLowerCase()).filter(Boolean)
      : [];

    if (categoryList.length > 0) {
      allProducts = allProducts.filter((p) =>
        categoryList.some((cat) => {
          return p.category.trim().toLowerCase() === cat;
        })
      );
    }

    // 2. Filter by subcategory
    if (subcategory) {
      allProducts = allProducts.filter(
        (p) => p.subcategory && p.subcategory.toLowerCase() === subcategory.toLowerCase()
      );
    }

    // 3. Filter by stock availability
    if (options?.inStock && !options?.outOfStock) {
      allProducts = allProducts.filter((p) => p.stock > 0);
    } else if (options?.outOfStock && !options?.inStock) {
      allProducts = allProducts.filter((p) => p.stock <= 0);
    }

    // 4. Filter by price range
    if (options?.minPrice !== undefined && !isNaN(options.minPrice)) {
      allProducts = allProducts.filter((p) => p.price >= options.minPrice!);
    }
    if (options?.maxPrice !== undefined && !isNaN(options.maxPrice)) {
      allProducts = allProducts.filter((p) => p.price <= options.maxPrice!);
    }

    const total = allProducts.length;
    const paginatedProducts = allProducts.slice(offset, offset + limit);

    const brands = Array.from(
      new Set(
        allProducts
          .map((product) => product.brand?.trim())
          .filter((brand): brand is string => Boolean(brand))
      )
    ).sort((a, b) => a.localeCompare(b));

    return {
      products: paginatedProducts,
      total,
      categories: DEFAULT_ACTIVE_CATEGORIES,
      brands,
    };
  } catch (err) {
    console.error("Error in getProductsFromDb:", err);
    return { products: [], total: 0, categories: DEFAULT_ACTIVE_CATEGORIES, brands: [] };
  }
}

export async function getProductBySlugFromDb(slug: string): Promise<Product | null> {
  try {
    const developmentProductIds =
      process.env.NODE_ENV === "development" ? getDevelopmentProductIds() : null;
    const developmentProductSkus =
      process.env.NODE_ENV === "development" ? getDevelopmentProductSkus() : null;

    if (process.env.NODE_ENV === "development" && (!developmentProductIds || !developmentProductSkus)) {
      console.error("Development product allowlist is missing or invalid.");
      return null;
    }

    const sql = `
      SELECT p.*, c.name as category_name, COALESCE(ibs.stock_quantity, 0) as stock_quantity
      FROM public.products p
      LEFT JOIN public.product_categories c ON p.product_category_id = c.id
      LEFT JOIN (
        SELECT product_id, SUM(quantity) as stock_quantity
        FROM public.inventory_bin_stock
        GROUP BY product_id
      ) ibs ON p.id = ibs.product_id
      WHERE (p.id::text = $1 OR p.sku = $1 OR p.name ILIKE $1) AND p.is_active = true
      ${developmentProductIds ? "AND (p.id = ANY($2::uuid[]) OR p.sku = ANY($3::text[]))" : ""}
      LIMIT 1
    `;
    const params = developmentProductIds
      ? [slug, developmentProductIds, developmentProductSkus]
      : [slug];
    const res = await query<DbProductRow>(sql, params);

    if (res.rows.length === 0) {
      return null;
    }

    return applyEcommerceTaxonomy(
      applyDevStorefrontMetadata(mapDbRowToProduct(res.rows[0]))
    );
  } catch (err) {
    console.error(`Error fetching product ${slug} from DB:`, err);
    return null;
  }
}
