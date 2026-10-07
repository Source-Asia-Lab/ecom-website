import type { Metadata } from "next";
import Storefront from "./storefront";
import { getProductsFromDb } from "../lib/db-products";

export const metadata: Metadata = {
  title: "Wholesale store | Source Asia",
  description:
    "Browse everyday wholesale goods and build your Source Asia order.",
};

interface StorePageProps {
  searchParams: Promise<{
    search?: string | string[];
    category?: string | string[];
  }>;
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function StorePage({ searchParams }: StorePageProps) {
  const filters = await searchParams;
  const initialSearch = firstValue(filters.search);
  const initialCategory = firstValue(filters.category);

  const initialData = await getProductsFromDb({
    search: initialSearch,
    category: initialCategory,
    limit: 100,
  });

  return (
    <Storefront
      key={`${initialSearch}|${initialCategory}`}
      initialSearch={initialSearch}
      initialCategory={initialCategory}
      initialProducts={initialData.products}
      initialCategories={initialData.categories}
      initialBrands={initialData.brands}
      initialTotal={initialData.total}
    />
  );
}
