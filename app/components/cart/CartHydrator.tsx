"use client";

import { useEffect } from "react";
import { useCartStore } from "../../store/cart-store";
import { useWishlistStore } from "../../store/wishlist-store";

export default function CartHydrator() {
  useEffect(() => {
    let mounted = true;
    Promise.all([
      Promise.resolve(useCartStore.persist.rehydrate()).catch(() => undefined),
      Promise.resolve(useWishlistStore.persist.rehydrate()).catch(() => undefined),
    ]).finally(() => {
      if (mounted) {
        useCartStore.getState().markHydrated();
        useWishlistStore.getState().markHydrated();
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  return null;
}

