import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product } from "./products";
import { getProductBySlug } from "./products";

interface WishlistState {
  productIds: string[];
  hasHydrated: boolean;
  markHydrated: () => void;
  toggleWishlist: (productId: string) => void;
  addToWishlist: (productId: string) => void;
  removeFromWishlist: (productId: string) => void;
  clearWishlist: () => void;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set) => ({
      productIds: [],
      hasHydrated: false,
      markHydrated: () => set({ hasHydrated: true }),
      toggleWishlist: (productId: string) =>
        set((state) => {
          const exists = state.productIds.includes(productId);
          return {
            productIds: exists
              ? state.productIds.filter((id) => id !== productId)
              : [...state.productIds, productId],
          };
        }),
      addToWishlist: (productId: string) =>
        set((state) =>
          state.productIds.includes(productId)
            ? state
            : { productIds: [...state.productIds, productId] }
        ),
      removeFromWishlist: (productId: string) =>
        set((state) => ({
          productIds: state.productIds.filter((id) => id !== productId),
        })),
      clearWishlist: () => set({ productIds: [] }),
    }),
    {
      name: "sourceasia-wishlist",
      version: 1,
      skipHydration: true,
      partialize: (state) => ({ productIds: state.productIds }),
    }
  )
);

export function resolveWishlistProducts(productIds: string[]): Product[] {
  return productIds.flatMap((id) => {
    const p = getProductBySlug(id);
    return p ? [p] : [];
  });
}
