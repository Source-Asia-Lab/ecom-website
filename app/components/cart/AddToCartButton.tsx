"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "../ui";
import type { Product } from "../../store/products";
import { useCartStore } from "../../store/cart-store";

export default function AddToCartButton({
  product,
  amount = 1,
}: {
  product: Product;
  amount?: number;
}) {
  const quantity = useCartStore(
    (state) =>
      state.items.find((line) => line.productId === product.id)?.quantity ?? 0,
  );
  const addProduct = useCartStore((state) => state.addProduct);
  const hasHydrated = useCartStore((state) => state.hasHydrated);
  const [showAdded, setShowAdded] = useState(false);
  const confirmationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnavailable = !hasHydrated || product.stock <= 0 || quantity >= product.stock;

  useEffect(() => {
    return () => {
      if (confirmationTimer.current) {
        clearTimeout(confirmationTimer.current);
      }
    };
  }, []);

  const handleAdd = () => {
    if (isUnavailable) {
      return;
    }

    addProduct(product, amount);
    setShowAdded(true);

    if (confirmationTimer.current) {
      clearTimeout(confirmationTimer.current);
    }

    confirmationTimer.current = setTimeout(() => setShowAdded(false), 1400);
  };

  return (
    <Button
      className="add-button"
      type="button"
      disabled={isUnavailable}
      onClick={handleAdd}
      aria-live="polite"
    >
      <span className="add-symbol" aria-hidden="true">{showAdded ? "✓" : "+"}</span>
      {showAdded ? "Added ✓" : "Add to Cart"}
    </Button>
  );
}
