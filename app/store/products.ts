import { ECOMMERCE_CATEGORY_NAMES } from "./category-taxonomy";

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  keywords: string[];
  category: string;
  subcategory?: string;
  price: number;
  isPriceOnRequest?: boolean;
  stock: number;
  imageUrl: string;
  imageAlt: string;
  isBestSeller?: boolean;
  brand?: string;
  rating?: number;
}

export type ProductAvailability = "in-stock" | "low-stock" | "out-of-stock";

const globalProductMap = new Map<string, Product>();

export function registerProduct(product: Product) {
  if (product && product.id) {
    globalProductMap.set(product.id, product);
    if (product.sku) {
      globalProductMap.set(product.sku, product);
    }
  }
}

export function registerProducts(productsList: Product[]) {
  for (const p of productsList) {
    registerProduct(p);
  }
}

export const products: Product[] = [];

export const productCategories: string[] = ECOMMERCE_CATEGORY_NAMES;

export const productBrands: string[] = [
  "Ironclad",
];

export function getProductBySlug(slug: string): Product | undefined {
  return globalProductMap.get(slug);
}

export function getBestSellerProducts(): Product[] {
  return Array.from(globalProductMap.values()).slice(0, 4);
}

export function getProductAvailability(product: Product): ProductAvailability {
  if (!product || product.stock <= 0) {
    return "out-of-stock";
  }
  return product.stock <= 100 ? "low-stock" : "in-stock";
}

export function filterProducts(search: string, category: string): Product[] {
  const normalizedSearch = search.trim().toLowerCase().replace(/\s+/g, " ");
  const searchTerms = normalizedSearch ? normalizedSearch.split(" ") : [];
  const normalizedCategory = category.trim().toLowerCase();

  const allCached = Array.from(globalProductMap.values());

  return allCached.filter((product) => {
    const matchesCategory =
      normalizedCategory.length === 0 ||
      product.category.toLowerCase().includes(normalizedCategory);

    const searchableText = [
      product.name,
      product.sku,
      product.category,
      product.description,
      product.id,
      ...product.keywords,
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch = searchTerms.every((term) => searchableText.includes(term));
    return matchesCategory && matchesSearch;
  });
}

export const formatPrice = (amount: number, isPriceOnRequest?: boolean) => {
  if (isPriceOnRequest || amount <= 0) {
    return "Price on request";
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
};
