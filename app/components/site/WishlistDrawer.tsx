"use client";

import Image from "next/image";
import Link from "next/link";
import { Button, Drawer, EmptyState } from "../ui";
import { useWishlistStore, resolveWishlistProducts } from "../../store/wishlist-store";
import { useCartStore } from "../../store/cart-store";
import { formatPrice } from "../../store/products";

interface WishlistDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function WishlistDrawer({ isOpen, onClose }: WishlistDrawerProps) {
  const productIds = useWishlistStore((state) => state.productIds);
  const removeFromWishlist = useWishlistStore((state) => state.removeFromWishlist);
  const clearWishlist = useWishlistStore((state) => state.clearWishlist);
  const addProductToCart = useCartStore((state) => state.addProduct);

  const wishlistProducts = resolveWishlistProducts(productIds);

  return (
    <Drawer
      open={isOpen}
      onClose={onClose}
      title="Your Wishlist"
      description={`${wishlistProducts.length} ${
        wishlistProducts.length === 1 ? "saved product" : "saved products"
      }`}
      className="wishlist-drawer"
    >
      {wishlistProducts.length === 0 ? (
        <EmptyState
          className="wishlist-empty"
          icon="♡"
          title="Your wishlist is empty."
          description="Click the heart icon on any product to save items here for later."
        />
      ) : (
        <div className="wishlist-lines">
          <div className="wishlist-lines__toolbar">
            <span>
              {wishlistProducts.length}{" "}
              {wishlistProducts.length === 1 ? "product" : "products"}
            </span>
            <Button
              className="wishlist-clear-btn"
              variant="quiet"
              onClick={clearWishlist}
            >
              Clear wishlist
            </Button>
          </div>

          {wishlistProducts.map((product) => (
            <article className="wishlist-line" key={product.id}>
              <div className="wishlist-line-image">
                <Image
                  fill
                  sizes="76px"
                  src={product.imageUrl}
                  alt={product.imageAlt}
                />
              </div>

              <div className="wishlist-line-main">
                <div className="wishlist-line-top">
                  <div>
                    <h3 className="wishlist-line-title">{product.name}</h3>
                    <span className="wishlist-line-sku">{product.sku} · {product.category}</span>
                  </div>
                  <span className="wishlist-line-price">
                    {formatPrice(product.price)}
                  </span>
                </div>

                <div className="wishlist-line-actions">
                  <Button
                    type="button"
                    variant="primary"
                    className="wishlist-add-cart-btn"
                    onClick={() => {
                      addProductToCart(product, 1);
                    }}
                  >
                    Add to Cart
                  </Button>
                  <button
                    type="button"
                    className="wishlist-remove-btn"
                    onClick={() => removeFromWishlist(product.id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}

          <div className="wishlist-footer-browse">
            <Link
              href="/store"
              className="ui-button ui-button--outline w-full"
              onClick={onClose}
            >
              Browse Catalog
            </Link>
          </div>
        </div>
      )}
    </Drawer>
  );
}
