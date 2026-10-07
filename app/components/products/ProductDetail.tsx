"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, PageContainer } from "../ui";
import AddToCartButton from "../cart/AddToCartButton";
import type { Product } from "../../store/products";
import { formatPrice, getProductAvailability } from "../../store/products";
import { useCartStore } from "../../store/cart-store";
import { useWishlistStore } from "../../store/wishlist-store";

export default function ProductDetail({ product }: { product: Product }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [imageSrc, setImageSrc] = useState(product.imageUrl);
  const [isZoomed, setIsZoomed] = useState(false);

  const fallbackImage =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' fill='%23f2f6f3'%3E%3Crect width='100%25' height='100%25'/%3E%3Cpath d='M150 150h100v100H150z' fill='%23d0ded3'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2358685d' font-family='sans-serif' font-size='14'%3EImage Unavailable%3C/text%3E%3C/svg%3E";

  const cartQuantity = useCartStore(
    (state) => state.items.find((line) => line.productId === product.id)?.quantity ?? 0,
  );

  const productIds = useWishlistStore((state) => state.productIds);
  const toggleWishlist = useWishlistStore((state) => state.toggleWishlist);
  const isWishlisted = productIds.includes(product.id);

  const availability = getProductAvailability(product);
  const availableToAdd = Math.max(0, product.stock - cartQuantity);
  const isOutOfStock = availability === "out-of-stock" || availableToAdd === 0;
  const selectedQuantity = Math.min(quantity, Math.max(1, availableToAdd));

  const isPriceOnRequest = product.isPriceOnRequest || product.price <= 0;
  const displayPriceText = formatPrice(product.price, isPriceOnRequest);

  const setSafeQuantity = (value: number) => {
    if (isOutOfStock) {
      setQuantity(1);
      return;
    }
    setQuantity(Math.min(availableToAdd, Math.max(1, Math.trunc(value) || 1)));
  };

  const handleBackClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/store");
    }
  };

  return (
    <PageContainer as="section" className="product-detail-section">
      {/* Back Navigation Bar */}
      <div className="product-detail-nav-bar">
        <a className="product-detail__back-link" href="/store" onClick={handleBackClick}>
          <span aria-hidden="true" className="product-detail__back-arrow">&larr;</span> Back to products
        </a>
      </div>

      <div className="product-detail__layout">
        {/* LEFT COLUMN: PRODUCT IMAGE PRESENTATION */}
        <div className="product-detail__media-column">
          <div
            className={`product-detail__image-box ${isZoomed ? "product-detail__image-box--zoomed" : ""}`}
            onMouseEnter={() => setIsZoomed(true)}
            onMouseLeave={() => setIsZoomed(false)}
          >
            <Image
              fill
              priority
              sizes="(max-width: 768px) 100vw, 50vw"
              src={imageSrc}
              alt={product.imageAlt || product.name}
              className="product-detail__main-img"
              onError={() => setImageSrc(fallbackImage)}
            />
          </div>
        </div>

        {/* RIGHT COLUMN: PRODUCT INFO & PURCHASING AREA */}
        <div className="product-detail__info-column">
          {/* Category & SKU Badges */}
          <div className="product-detail__badges">
            {product.category && (
              <Badge className="product-detail__cat-badge">{product.category}</Badge>
            )}
            <Badge className="product-detail__sku-badge">SKU: {product.sku}</Badge>
            {product.brand && (
              <Badge className="product-detail__brand-badge">{product.brand}</Badge>
            )}
          </div>

          {/* Product Title */}
          <h1 className="product-detail__title">{product.name}</h1>

          {/* Product Description */}
          <p className="product-detail__description">{product.description}</p>

          {/* Pricing Block */}
          <div className="product-detail__price-card">
            <span className="product-detail__price-label">PRICE PER UNIT</span>
            <div className={`product-detail__price-value ${isPriceOnRequest ? "product-detail__price-value--inquire" : ""}`}>
              {displayPriceText}
            </div>
          </div>

          {/* Availability Status Indicator */}
          <div className="product-detail__status-row">
            <span className={`stock-label stock-label--${availability}`}>
              <span className="stock-dot" aria-hidden="true" />
              {availability === "out-of-stock"
                ? "Out of stock"
                : availability === "low-stock"
                  ? `Low stock · ${product.stock.toLocaleString("en-IN")} available`
                  : `${product.stock.toLocaleString("en-IN")} in stock`}
            </span>
          </div>

          {/* Wishlist Button Row */}
          <div className="product-detail__wishlist-row">
            <button
              type="button"
              className={`product-detail__wishlist-btn${
                isWishlisted ? " product-detail__wishlist-btn--active" : ""
              }`}
              onClick={() => toggleWishlist(product.id)}
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
              <span>{isWishlisted ? "♥ Added to Wishlist" : "♡ Add to Wishlist"}</span>
            </button>
          </div>

          {/* Quantity Selector & Add to Cart Action */}
          <div className="product-detail__purchase-card">
            <div className="product-detail__quantity-group">
              <label htmlFor="product-qty-input" className="product-detail__qty-label">Quantity</label>
              <div className="quantity-control product-detail__qty-control">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  disabled={isOutOfStock || quantity <= 1}
                  onClick={() => setSafeQuantity(quantity - 1)}
                >
                  &minus;
                </button>
                <input
                  id="product-qty-input"
                  type="number"
                  min={1}
                  max={availableToAdd}
                  value={selectedQuantity}
                  disabled={isOutOfStock}
                  aria-label="Product quantity"
                  onChange={(event) => setSafeQuantity(Number(event.target.value))}
                />
                <button
                  type="button"
                  aria-label="Increase quantity"
                  disabled={isOutOfStock || selectedQuantity >= availableToAdd}
                  onClick={() => setSafeQuantity(quantity + 1)}
                >
                  +
                </button>
              </div>
            </div>

            <div className="product-detail__cta-wrap">
              <AddToCartButton product={product} amount={selectedQuantity} />
            </div>
          </div>
        </div>
      </div>

      {/* OPTIONAL PRODUCT SPECIFICATIONS TABLE SECTION */}
      <div className="product-detail__specs-section">
        <h2 className="product-detail__specs-title">PRODUCT SPECIFICATIONS</h2>
        <div className="product-detail__specs-grid">
          <div className="product-detail__spec-row">
            <span className="product-detail__spec-label">SKU / Item #</span>
            <span className="product-detail__spec-val">{product.sku}</span>
          </div>
          {product.category && (
            <div className="product-detail__spec-row">
              <span className="product-detail__spec-label">Category</span>
              <span className="product-detail__spec-val">{product.category}</span>
            </div>
          )}
          {product.subcategory && (
            <div className="product-detail__spec-row">
              <span className="product-detail__spec-label">Subcategory</span>
              <span className="product-detail__spec-val">{product.subcategory}</span>
            </div>
          )}
          {product.brand && (
            <div className="product-detail__spec-row">
              <span className="product-detail__spec-label">Manufacturer / Brand</span>
              <span className="product-detail__spec-val">{product.brand}</span>
            </div>
          )}
          <div className="product-detail__spec-row">
            <span className="product-detail__spec-label">Availability</span>
            <span className="product-detail__spec-val">{product.stock > 0 ? `${product.stock} units in stock` : "Out of Stock"}</span>
          </div>
          <div className="product-detail__spec-row">
            <span className="product-detail__spec-label">Order Type</span>
            <span className="product-detail__spec-val">Direct Business Order (B2B Wholesale)</span>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
