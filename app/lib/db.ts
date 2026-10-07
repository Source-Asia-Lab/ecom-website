import { Pool, QueryResultRow } from 'pg';
import type { Product } from '../store/products';
import { resolveProductImage } from './image-resolver';

let pool: Pool;

export function getDbPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required");
    }

    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
) {
  const p = getDbPool();
  return p.query<T>(text, params);
}

export const FALLBACK_IMAGE_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' fill='%23f2f6f3'%3E%3Crect width='100%25' height='100%25'/%3E%3Cpath d='M150 150h100v100H150z' fill='%23d0ded3'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2358685d' font-family='sans-serif' font-size='14'%3EImage Unavailable%3C/text%3E%3C/svg%3E";

export interface DbProductRow {
  id: string;
  name: string | null;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  product_type: string | null;
  cost_price: string | number | null;
  sale_price: string | number | null;
  weight: string | number | null;
  volume: string | number | null;
  image_url: string | null;
  is_active: boolean | null;
  lead_time_days: number | null;
  unit_of_measure: string | null;
  unit_weight: string | number | null;
  hsn_sac_code: string | null;
  tax_category: string | null;
  default_gst_rate: string | number | null;
  product_category_id: string | null;
  product_sub_category_id: string | null;
  category_name?: string | null;
  sub_category_name?: string | null;
  stock_quantity?: string | number | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
}

/**
 * Safely decodes and normalizes encoded characters in database product text
 */
export function normalizeProductText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\s*\?1%/g, " ±1%")
    .replace(/\s*\?5%/g, " ±5%")
    .replace(/\s*\?10%/g, " ±10%")
    .replace(/\s*\?20%/g, " ±20%")
    .replace(/\s*\?0\.25pF/g, " ±0.25pF")
    .replace(/\?F/g, "µF")
    .replace(/\?H/g, "µH")
    .replace(/\?s/gi, "µs")
    .replace(/\s+\?\s+/g, " - ")
    .replace(/\s*\?\s*/g, " - ")
    .replace(/-\s+-/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Determines dynamic Category and Subcategory based on DB row and product name
 */
export function deriveProductTaxonomy(row: DbProductRow, rawName: string): { category: string; subcategory: string } {
  if (row.category_name && row.category_name.trim() && row.category_name.trim() !== "Test category") {
    return {
      category: row.category_name.trim(),
      subcategory: row.sub_category_name && row.sub_category_name.trim() ? row.sub_category_name.trim() : "General",
    };
  }

  const n = rawName.toLowerCase();

  if (/washer/i.test(n)) {
    return {
      category: "Washers",
      subcategory: /spring/i.test(n) ? "Spring Washers" : "Flat Washers",
    };
  }
  if (/bolt|screw/i.test(n)) {
    return {
      category: "Bolts & Screws",
      subcategory: /allen/i.test(n) ? "Allen Bolts" : /hex/i.test(n) ? "Hex Bolts" : "Screws",
    };
  }
  if (/nut/i.test(n)) {
    return { category: "Nuts & Fasteners", subcategory: "Hex Nuts" };
  }
  if (/capacitor|cap\b/i.test(n)) {
    return { category: "Electronic Components", subcategory: "Capacitors" };
  }
  if (/resistor|resistors|\b\d+k?\s*ohm/i.test(n)) {
    return { category: "Electronic Components", subcategory: "Resistors" };
  }
  if (/diode|tvs/i.test(n)) {
    return { category: "Electronic Components", subcategory: "Diodes" };
  }
  if (/ferrite|inductor/i.test(n)) {
    return { category: "Electronic Components", subcategory: "Inductors & Beads" };
  }
  if (/sheet|ss 316|ss 304|mdf/i.test(n)) {
    return {
      category: "Metals & Sheets",
      subcategory: /ms sheet/i.test(n) ? "MS Sheets" : "Stainless Steel Sheets",
    };
  }
  if (/fan|cooling/i.test(n)) {
    return { category: "Electrical & Wiring", subcategory: "Cooling Fans" };
  }
  if (/cable tie|heat shrink|sleeve|plug|clip/i.test(n)) {
    return { category: "Electrical & Wiring", subcategory: "Cable & Wiring Accessories" };
  }
  if (/glove|helmet|safety|tripod|detector/i.test(n)) {
    return { category: "Safety Equipment", subcategory: "Personal Safety" };
  }
  if (/end mill|tapping bit|grinder|wheel|load cell/i.test(n)) {
    return { category: "Tools & Machinery", subcategory: "Cutting & Machine Tools" };
  }
  if (/tape|film|polybag|bag/i.test(n)) {
    return { category: "Packaging & Supplies", subcategory: "Tapes & Packaging" };
  }

  return { category: "Industrial Hardware", subcategory: "General Hardware" };
}

export function mapDbRowToProduct(row: DbProductRow): Product {
  const rawSku = row.sku && row.sku.trim() ? row.sku.trim() : `SKU-${row.id.substring(0, 8).toUpperCase()}`;
  const rawName = row.name && row.name.trim() ? row.name.trim() : `Product ${rawSku}`;
  
  const name = normalizeProductText(rawName);
  const sku = rawSku;

  const rawDescription =
    row.description && row.description.trim()
      ? row.description.trim()
      : `High-quality industrial ${name} (SKU: ${sku}). Engineered for heavy-duty business applications.`;
  const description = normalizeProductText(rawDescription);

  const salePrice = row.sale_price !== null && row.sale_price !== undefined ? Number(row.sale_price) : 0;
  const hasSellingPrice = Number.isFinite(salePrice) && salePrice > 0;
  const price = hasSellingPrice ? salePrice : 0;
  const isPriceOnRequest = !hasSellingPrice;

  // Stock status logic:
  // COALESCE(SUM(inventory_bin_stock.quantity), 0)
  // If stock_quantity > 0 -> In stock (green dot, Add to Cart enabled)
  // If stock_quantity = 0 -> Out of stock (Add to Cart disabled)
  const dbStock = row.stock_quantity !== null && row.stock_quantity !== undefined ? Number(row.stock_quantity) : 0;
  const stock = Math.max(0, dbStock);

  // Image Resolution
  const imageUrl = resolveProductImage(row.image_url, name, sku);

  // Dynamic taxonomy
  const { category, subcategory } = deriveProductTaxonomy(row, name);

  const keywords = [
    ...new Set(
      `${name} ${sku} ${row.barcode || ""} ${category} ${subcategory} ${description}`
        .toLowerCase()
        .replace(/[^a-z0-9\s]/gi, "")
        .split(/\s+/)
        .filter((w) => w.length > 2)
    ),
  ];

  return {
    id: row.id,
    sku,
    name,
    description,
    keywords,
    category,
    subcategory,
    price,
    isPriceOnRequest,
    stock,
    imageUrl,
    imageAlt: name,
    isBestSeller: true,
    brand: "Ironclad",
    rating: 4.8,
  };
}
