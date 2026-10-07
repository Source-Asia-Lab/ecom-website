import { EmptyState } from "../ui";
import type { Product } from "../../store/products";
import ProductCard from "./ProductCard";

interface ProductGridProps {
  products: Product[];
  revealOnScroll?: boolean;
  onClearFilters?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

export default function ProductGrid({
  products,
  revealOnScroll = false,
  onClearFilters,
  emptyTitle = "No products found matching your filters.",
  emptyDescription = "Try relaxing your price limits, category choices, or stock availability.",
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="product-grid-empty-wrap">
        <EmptyState
          className="empty-results"
          title={emptyTitle}
          description={emptyDescription}
          action={
            onClearFilters ? (
              <button
                type="button"
                className="active-filters__clear"
                onClick={onClearFilters}
                style={{ marginTop: "12px" }}
              >
                Clear all filters
              </button>
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <div className="product-grid">
      {products.map((product, index) => (
        <ProductCard
          key={product.id}
          product={product}
          revealOnScroll={revealOnScroll}
          index={index}
        />
      ))}
    </div>
  );
}
