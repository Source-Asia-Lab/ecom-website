"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Badge, Card } from "../ui";
import AddToCartButton from "../cart/AddToCartButton";
import type { Product } from "../../store/products";
import { formatPrice, getProductAvailability } from "../../store/products";
import { useWishlistStore } from "../../store/wishlist-store";

interface ProductCardProps {
  product: Product;
  revealOnScroll?: boolean;
  index?: number;
}

function getCategorySlug(categoryName?: string, name?: string): string {
  const cat = (categoryName || "").toLowerCase();
  const n = (name || "").toLowerCase();

  if (cat.includes("raspberry") || n.includes("raspberry") || n.includes("pi 4")) return "raspberry-pi";
  if (cat.includes("sd card") || n.includes("sd card") || n.includes("micro sd")) return "sd-cards";
  if (cat.includes("power") || cat.includes("cable") || n.includes("power") || n.includes("chord") || n.includes("cable")) return "power-supplies";
  if (cat.includes("clip") || n.includes("clip") || n.includes("strapping clip")) return "clips";
  if (cat.includes("tape") || n.includes("tape")) return "tapes";
  if (cat.includes("stretch") || n.includes("stretch film")) return "stretch-film";
  if (cat.includes("glove") || cat.includes("safety") || n.includes("glove")) return "gloves";
  if (cat.includes("handtool") || cat.includes("tool") || n.includes("tool") || n.includes("screwdriver")) return "handtools";
  if (cat.includes("wire") || n.includes("wire")) return "hook-up-wires";
  if (cat.includes("loctite") || cat.includes("adhesive") || n.includes("loctite")) return "loctites";
  if (cat.includes("sticker") || cat.includes("label") || n.includes("sticker")) return "stickers";
  if (cat.includes("office") || n.includes("office")) return "office-supplies";

  return "default";
}

export default function ProductCard({
  product,
  revealOnScroll = false,
  index = 0,
}: ProductCardProps) {
  const availability = getProductAvailability(product);
  const productIds = useWishlistStore((state) => state.productIds);
  const toggleWishlist = useWishlistStore((state) => state.toggleWishlist);
  const isWishlisted = productIds.includes(product.id);
  const [imageSrc, setImageSrc] = useState(product.imageUrl);

  const fallbackImage =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' fill='%23f2f6f3'%3E%3Crect width='100%25' height='100%25'/%3E%3Cpath d='M150 150h100v100H150z' fill='%23d0ded3'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2358685d' font-family='sans-serif' font-size='14'%3EImage Unavailable%3C/text%3E%3C/svg%3E";

  const isPriceOnRequest = product.isPriceOnRequest || product.price <= 0;
  const displayPriceText = formatPrice(product.price, isPriceOnRequest);
  const categorySlug = getCategorySlug(product.category, product.name);

  return (
    <Card
      as="article"
      className={`product-card product-card--cat-${categorySlug}${revealOnScroll ? " product-card--reveal" : ""}`}
      style={{ animationDelay: `${index * 55}ms` }}
    >
      {/* Product Image Area */}
      <div className="product-image-wrap">
        <Link href={`/store/${product.id}`} className="product-image-link" tabIndex={-1}>
          <Image
            fill
            sizes="(max-inline-size: 640px) calc(100vw - 32px), (max-inline-size: 900px) 50vw, 25vw"
            src={imageSrc}
            alt={product.imageAlt || product.name}
            className="product-card-image"
            onError={() => setImageSrc(fallbackImage)}
          />
        </Link>
        <button
          className={`wishlist-card-btn${isWishlisted ? " wishlist-card-btn--active" : ""}`}
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleWishlist(product.id);
          }}
          aria-label={
            isWishlisted
              ? `Remove ${product.name} from wishlist`
              : `Add ${product.name} to wishlist`
          }
          title={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill={isWishlisted ? "#e11d48" : "none"}
            stroke={isWishlisted ? "#e11d48" : "currentColor"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.78-8.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>

      {/* Product Body */}
      <div className="product-body">
        <div className="product-meta">
          {product.category && (
            <Badge className="product-category-tag">{product.category}</Badge>
          )}
          <Badge className="product-sku">{product.sku}</Badge>
        </div>

        <h3 className="product-title">
          <Link href={`/store/${product.id}`} className="product-title-link">
            {product.name}
          </Link>
        </h3>

        <p className="product-description">{product.description}</p>

        <div className="product-detail-row">
          <div className="price-block">
            <span className="price-label">Price per unit</span>
            <div className={`product-price${isPriceOnRequest ? " product-price--inquire" : ""}`}>
              {displayPriceText}
            </div>
          </div>

          <span className={`stock-label stock-label--${availability}`}>
            <span className="stock-dot" aria-hidden="true" />
            {availability === "out-of-stock"
              ? "Out of stock"
              : availability === "low-stock"
                ? "Low stock"
                : "In stock"}
          </span>
        </div>

        <div className="product-actions">
          <AddToCartButton product={product} />
        </div>
      </div>
    </Card>
  );
}

