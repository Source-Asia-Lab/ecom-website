"use client";

import Link from "next/link";
import { useCartStore } from "../../store/cart-store";

interface CartIndicatorProps {
  onClick?: () => void;
}

export default function CartIndicator({ onClick }: CartIndicatorProps) {
  const count = useCartStore((state) =>
    state.hasHydrated
      ? state.items.reduce((total, line) => total + line.quantity, 0)
      : 0,
  );

  return (
    <Link
      className="cart-trigger site-cart-link"
      href="/store"
      aria-label={`Cart, ${count} items`}
      onClick={(e) => {
        if (onClick) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
      <span>Cart</span>
      <span className="cart-count" aria-hidden="true">{count}</span>
    </Link>
  );
}

