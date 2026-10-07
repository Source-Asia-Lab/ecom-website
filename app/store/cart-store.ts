import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product } from "./products";
import { getProductBySlug } from "./products";

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface ResolvedCartLine {
  product: Product;
  quantity: number;
}

interface CartState {
  items: CartLine[];
  hasHydrated: boolean;
  markHydrated: () => void;
  addProduct: (product: Product, quantity?: number) => void;
  increaseQuantity: (productId: string) => void;
  decreaseQuantity: (productId: string) => void;
  removeProduct: (productId: string) => void;
  clearCart: () => void;
}

function normalizeCartLines(value: unknown): CartLine[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const quantities = new Map<string, number>();

  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const line = entry as {
      productId?: unknown;
      product?: { id?: unknown };
      quantity?: unknown;
    };
    const productId =
      typeof line.productId === "string"
        ? line.productId
        : typeof line.product?.id === "string"
          ? line.product.id
          : "";
    const product = getProductBySlug(productId);
    const quantity = Math.trunc(Number(line.quantity));

    if (!product || !Number.isFinite(quantity) || quantity < 1 || product.stock < 1) {
      continue;
    }

    quantities.set(
      productId,
      Math.min(product.stock, (quantities.get(productId) ?? 0) + quantity),
    );
  }

  return [...quantities].map(([productId, quantity]) => ({ productId, quantity }));
}

export function resolveCartLines(lines: CartLine[]): ResolvedCartLine[] {
  return lines.flatMap((line) => {
    const product = getProductBySlug(line.productId);
    return product ? [{ product, quantity: line.quantity }] : [];
  });
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],
      hasHydrated: false,
      markHydrated: () => set({ hasHydrated: true }),
      addProduct: (product, requestedQuantity = 1) =>
        set((state) => {
          const quantityToAdd = Math.trunc(requestedQuantity);
          if (product.stock <= 0 || !Number.isFinite(quantityToAdd) || quantityToAdd < 1) {
            return state;
          }

          const existingLine = state.items.find((line) => line.productId === product.id);
          const currentQuantity = existingLine?.quantity ?? 0;
          const nextQuantity = Math.min(product.stock, currentQuantity + quantityToAdd);

          if (nextQuantity === currentQuantity) {
            return state;
          }

          if (!existingLine) {
            return {
              items: [...state.items, { productId: product.id, quantity: nextQuantity }],
            };
          }

          return {
            items: state.items.map((line) =>
              line.productId === product.id
                ? { ...line, quantity: nextQuantity }
                : line,
            ),
          };
        }),
      increaseQuantity: (productId) =>
        set((state) => ({
          items: state.items.map((line) => {
            const product = getProductBySlug(productId);
            return line.productId === productId && line.quantity < (product?.stock ?? 0)
              ? { ...line, quantity: line.quantity + 1 }
              : line;
          }),
        })),
      decreaseQuantity: (productId) =>
        set((state) => ({
          items: state.items.map((line) =>
            line.productId === productId && line.quantity > 1
              ? { ...line, quantity: line.quantity - 1 }
              : line,
          ),
        })),
      removeProduct: (productId) =>
        set((state) => ({
          items: state.items.filter((line) => line.productId !== productId),
        })),
      clearCart: () => set({ items: [] }),
    }),
    {
      name: "sourceasia-cart",
      version: 1,
      skipHydration: true,
      partialize: (state) => ({ items: state.items }),
      migrate: (persistedState) => {
        const persisted = persistedState as { items?: unknown };
        return { items: normalizeCartLines(persisted?.items) } as CartState;
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as { items?: unknown };
        return {
          ...currentState,
          items: normalizeCartLines(persisted?.items),
        };
      },
    },
  ),
);
