"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageContainer } from "../ui";
import ProductCard from "../products/ProductCard";
import { registerProducts, Product } from "../../store/products";

export type ShowcaseTab = "best-sellers" | "popular" | "new-arrivals";

export default function HomepageShowcase() {
  const [activeTab, setActiveTab] = useState<ShowcaseTab>("best-sellers");
  const [productsList, setProductsList] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function loadShowcaseProducts() {
      try {
        const res = await fetch("/api/products?limit=12");
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.products) {
            setProductsList(data.products);
            registerProducts(data.products);
          }
        }
      } catch (err) {
        console.error("Error loading showcase products:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }
    loadShowcaseProducts();
    return () => {
      isMounted = false;
    };
  }, []);

  const getTabProducts = (tab: ShowcaseTab): Product[] => {
    if (productsList.length === 0) return [];
    const total = productsList.length;

    switch (tab) {
      case "best-sellers": {
        const best = productsList.filter((p) => p.isBestSeller);
        if (best.length >= 4) return best.slice(0, 4);
        const remaining = productsList.filter((p) => !p.isBestSeller);
        return [...best, ...remaining].slice(0, 4);
      }
      case "popular": {
        if (total <= 4) return productsList.slice(0, 4);
        const start = Math.min(2, total - 4);
        const slice = productsList.slice(start, start + 4);
        if (slice.length < 4) {
          const fill = productsList.slice(0, 4 - slice.length);
          return [...slice, ...fill];
        }
        return slice;
      }
      case "new-arrivals": {
        const reversed = [...productsList].reverse();
        return reversed.slice(0, 4);
      }
      default:
        return productsList.slice(0, 4);
    }
  };

  const displayedProducts = getTabProducts(activeTab);

  return (
    <PageContainer
      as="section"
      className="landing-products homepage-showcase-section scroll-reveal"
      id="products"
      aria-labelledby="showcase-title"
    >
      <div className="showcase-header-wrap">
        <div className="showcase-header-main">
          <p className="section-heading__eyebrow">BEST SELLERS</p>
          <h2 id="showcase-title" className="showcase-main-title">
            Best Sellers
          </h2>
          <p className="showcase-subtext">
            Explore our top-rated best-selling products chosen by our business customers.
          </p>
        </div>

        {/* Showcase Category Tabs */}
        <div className="showcase-tabs-container" role="tablist" aria-label="Product Showcase Categories">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "best-sellers"}
            className={`showcase-tab-btn ${activeTab === "best-sellers" ? "showcase-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("best-sellers")}
          >
            Best Sellers
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "popular"}
            className={`showcase-tab-btn ${activeTab === "popular" ? "showcase-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("popular")}
          >
            Popular
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "new-arrivals"}
            className={`showcase-tab-btn ${activeTab === "new-arrivals" ? "showcase-tab-btn--active" : ""}`}
            onClick={() => setActiveTab("new-arrivals")}
          >
            New Arrivals
          </button>
        </div>
      </div>

      {/* Product Grid */}
      <div className="showcase-product-grid">
        {isLoading && productsList.length === 0 ? (
          Array.from({ length: 4 }).map((_, idx) => (
            <div key={`showcase-skeleton-${idx}`} className="product-card" style={{ minHeight: "360px", opacity: 0.7 }}>
              <div className="product-image-wrap ui-skeleton" style={{ height: "200px" }} />
              <div className="product-body" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px" }}>
                <span className="ui-skeleton ui-skeleton--short" style={{ width: "40%", height: "14px" }} />
                <span className="ui-skeleton ui-skeleton--heading" style={{ width: "80%", height: "20px" }} />
                <span className="ui-skeleton" style={{ width: "100%", height: "14px" }} />
              </div>
            </div>
          ))
        ) : (
          displayedProducts.map((product, index) => (
            <ProductCard
              key={`${activeTab}-${product.id}`}
              product={product}
              index={index}
            />
          ))
        )}
      </div>

      {/* View All Products CTA */}
      <div className="showcase-footer-cta">
        <Link href="/store" className="showcase-view-all-link">
          <span>View All Products</span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>
    </PageContainer>
  );
}

