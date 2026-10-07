"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { ECOMMERCE_CATEGORIES } from "../../store/category-taxonomy";

export interface CategoryItem {
  id: string;
  label: string;
  query: string;
  imageUrl: string;
}

export default function HexCategoryRibbon() {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const categories: CategoryItem[] = ECOMMERCE_CATEGORIES.map((category, index) => ({
    id: `ecommerce-category-${index}`,
    label: category.name,
    query: category.name,
    imageUrl: category.imageUrl,
  }));

  const handleScrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -340, behavior: "smooth" });
    }
  };

  const handleScrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 340, behavior: "smooth" });
    }
  };

  const handleCategoryClick = (query: string) => {
    router.push(`/store?category=${encodeURIComponent(query)}`);
  };

  return (
    <section className="hex-ribbon-section" aria-label="Category Shopping Ribbon">
      {/* Shared SVG Definitions for metallic gradients */}
      <svg style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }} aria-hidden="true">
        <defs>
          <linearGradient id="hex-metal-border" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
            <stop offset="35%" stopColor="#9bb0a2" stopOpacity="0.5" />
            <stop offset="70%" stopColor="#415045" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#d5e2d8" stopOpacity="0.75" />
          </linearGradient>
          <linearGradient id="hex-metal-border-hover" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
            <stop offset="30%" stopColor="#bad77a" stopOpacity="0.9" />
            <stop offset="70%" stopColor="#7ba34f" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
          </linearGradient>
        </defs>
      </svg>

      {/* Top Banner Header Strip */}
      <div className="hex-ribbon-top-bar">
        <div className="hex-ribbon-top-inner">
          <span className="hex-ribbon-shop-now">
            SHOP NOW <span className="hex-arrow-symbol">&#x25B7;</span>
          </span>
        </div>
      </div>

      {/* Main Dark Carousel Area */}
      <div className="hex-ribbon-carousel-container">
        {/* Edge Fade Gradients for smooth carousel edges */}
        <div className="hex-edge-fade-left" aria-hidden="true" />
        <div className="hex-edge-fade-right" aria-hidden="true" />

        {/* Left Arrow Button */}
        <button
          type="button"
          className="hex-carousel-arrow hex-carousel-arrow--left"
          onClick={handleScrollLeft}
          aria-label="Scroll left to previous categories"
        >
          &#x276E;
        </button>

        {/* Scrollable Track */}
        <div className="hex-ribbon-track" ref={scrollRef}>
          {categories.map((cat, idx) => (
            <button
              key={cat.id || idx}
              type="button"
              className="hex-category-card"
              onClick={() => handleCategoryClick(cat.query)}
              title={`Shop ${cat.label}`}
            >
              <div className="hex-frame-wrapper">
                <svg
                  viewBox="0 0 120 104"
                  className="hex-svg-frame"
                  aria-hidden="true"
                >
                  <defs>
                    <clipPath id={`hex-clip-${idx}`}>
                      <polygon points="30,3 90,3 117,52 90,101 30,101 3,52" />
                    </clipPath>
                  </defs>

                  {/* Dark Base Layer */}
                  <polygon
                    points="30,3 90,3 117,52 90,101 30,101 3,52"
                    fill="#121614"
                  />

                  {/* Image Layer */}
                  <image
                    href={cat.imageUrl}
                    x="0"
                    y="0"
                    width="120"
                    height="104"
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#hex-clip-${idx})`}
                    className="hex-image-element"
                  />

                  {/* Outer Dark Shadow Border */}
                  <polygon
                    points="30,3 90,3 117,52 90,101 30,101 3,52"
                    fill="none"
                    stroke="rgba(0, 0, 0, 0.6)"
                    strokeWidth="3.5"
                  />

                  {/* Main Metallic Border Stroke */}
                  <polygon
                    points="30,3 90,3 117,52 90,101 30,101 3,52"
                    fill="none"
                    className="hex-main-stroke"
                    strokeWidth="2.2"
                  />

                  {/* Inner Bevel Highlight Line */}
                  <polygon
                    points="32,6 88,6 114,52 88,98 32,98 6,52"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.18)"
                    strokeWidth="1"
                    className="hex-inner-bevel"
                  />
                </svg>
              </div>
              <span className="hex-category-label">{cat.label}</span>
            </button>
          ))}
        </div>

        {/* Right Arrow Button */}
        <button
          type="button"
          className="hex-carousel-arrow hex-carousel-arrow--right"
          onClick={handleScrollRight}
          aria-label="Scroll right to next categories"
        >
          &#x276F;
        </button>
      </div>
    </section>
  );
}
