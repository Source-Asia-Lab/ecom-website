"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Button,
  Drawer,
  EmptyState,
  FieldLabel,
  Input,
  PageContainer,
} from "../components/ui";
import BrandLogo from "../components/site/BrandLogo";
import SectionHeading from "../components/site/SectionHeading";
import SiteHeader from "../components/site/SiteHeader";
import SiteFooter from "../components/site/SiteFooter";
import ProductGrid from "../components/products/ProductGrid";
import ProductFilterSidebar, {
  FilterState,
} from "../components/products/ProductFilterSidebar";
import { resolveCartLines, useCartStore } from "./cart-store";
import {
  formatPrice,
  productBrands,
  productCategories,
  registerProducts,
  Product,
} from "./products";
import {
  ECOMMERCE_CATEGORY_BY_NAME,
  ECOMMERCE_SUBCATEGORY_NAMES,
  getEcommerceTypeImage,
} from "./category-taxonomy";

export type SortOption = "a-z" | "z-a" | "price-asc" | "price-desc";

interface StorefrontProps {
  initialSearch: string;
  initialCategory: string;
  initialProducts?: Product[];
  initialCategories?: string[];
  initialBrands?: string[];
  initialTotal?: number;
}

interface CategoryMeta {
  title: string;
  description: string;
  imageUrl: string;
}

const CATEGORY_INFO_MAP: Record<string, CategoryMeta> = {
  "Raspberry Pi": {
    title: "Raspberry Pi",
    description: "Compact single-board computing hardware for projects, education, and embedded prototypes.",
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
  },
  "SD Cards": {
    title: "SD Cards",
    description: "Reliable memory cards for storage, data logging, and device expansion.",
    imageUrl: "https://images.unsplash.com/photo-1584433144859-1fc3ab64a957?auto=format&fit=crop&w=600&q=80",
  },
  "Power": {
    title: "Power",
    description: "Power cables and accessories for dependable electrical connectivity.",
    imageUrl: "https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?auto=format&fit=crop&w=600&q=80",
  },
  "Clips": {
    title: "Clips",
    description: "Strapping and retention clips designed for cable and component organization.",
    imageUrl: "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=600&q=80",
  },
  "Tapes & Films": {
    title: "Tapes & Films",
    description: "Industrial tape and stretch film products for packing, securing, and surface protection.",
    imageUrl: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80",
  },
  "Cables": {
    title: "Cables",
    description: "Cable assemblies and wire solutions for electrical and data applications.",
    imageUrl: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80",
  },
  "Fasteners": {
    title: "Fasteners",
    description: "Industrial fastening products including bolts, screws, nuts, washers, rivets, anchors, and threaded rods for heavy manufacturing and construction.",
    imageUrl: "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=600&q=80",
  },
  "Bolts & Screws": {
    title: "Fasteners - Bolts & Screws",
    description: "Industrial fastening products including hex bolts, socket screws, machine screws, and threaded fasteners.",
    imageUrl: "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=600&q=80",
  },
  "Washers": {
    title: "Washers & Fasteners",
    description: "Flat washers, spring washers, lock washers, and sealing washers in stainless steel, brass, and hardened steel.",
    imageUrl: "/images/products/fasteners-kit.jpg",
  },
  "Nuts & Fasteners": {
    title: "Nuts & Industrial Fasteners",
    description: "Hex nuts, lock nuts, flange nuts, and industrial fastening components engineered for heavy load applications.",
    imageUrl: "/images/products/fasteners-kit.jpg",
  },
  "Safety Equipment": {
    title: "Safety Supplies",
    description: "Industrial safety supplies including hand and arm protection, foot protection, eye protection, head protection, and high visibility garments.",
    imageUrl: "https://images.unsplash.com/photo-1584467735871-8e85353a8413?auto=format&fit=crop&w=600&q=80",
  },
  "Safety": {
    title: "Safety Supplies",
    description: "Industrial safety supplies including hand and arm protection, foot protection, eye protection, head protection, and high visibility garments.",
    imageUrl: "https://images.unsplash.com/photo-1584467735871-8e85353a8413?auto=format&fit=crop&w=600&q=80",
  },
  "Tools & Machinery": {
    title: "Tools & Machinery",
    description: "High-performance cutting tools, power tools, metalworking equipment, and precision industrial hardware.",
    imageUrl: "/images/products/cordless-drill.jpg",
  },
  "Cutting Tools": {
    title: "Cutting Tools & Metalworking",
    description: "Drill bits, end mills, inserts, and metalworking cutting tools.",
    imageUrl: "/images/products/cordless-drill.jpg",
  },
  "Industrial Hardware": {
    title: "Industrial Hardware",
    description: "Workshop tools, grinding machinery, maintenance equipment, and assembly hardware.",
    imageUrl: "/images/products/bench-grinder.jpg",
  },
  "Abrasives": {
    title: "Abrasives",
    description: "Grinding wheels, sanding discs, surface conditioning, and polishing products.",
    imageUrl: "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=600&q=80",
  },
  "Packaging & Supplies": {
    title: "Packaging, Adhesives & Tape",
    description: "Industrial adhesives, threadlockers, sealants, packaging tapes, and shipping supplies.",
    imageUrl: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=600&q=80",
  },
  "Electrical & Wiring": {
    title: "Electrical & Wiring",
    description: "Connectors, terminals, industrial cables, enclosures, switches, and wiring accessories.",
    imageUrl: "https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?auto=format&fit=crop&w=600&q=80",
  },
  "Electrical": {
    title: "Electrical & Wiring",
    description: "Connectors, terminals, industrial cables, enclosures, switches, and wiring accessories.",
    imageUrl: "https://images.unsplash.com/photo-1544724569-5f546fd6f2b5?auto=format&fit=crop&w=600&q=80",
  },
  "Electronic Components": {
    title: "Electronics & Batteries",
    description: "Industrial batteries, circuit components, sensors, and electronic hardware.",
    imageUrl: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80",
  },
  "Metals & Sheets": {
    title: "Metals & Sheets",
    description: "Quality metal sheets, raw materials, brass stock, and industrial metal plates.",
    imageUrl: "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=600&q=80",
  },
  "Fleet and Automotive": {
    title: "Fleet & Automotive",
    description: "Automotive maintenance supplies, fleet hardware, lubrication, and vehicle care products.",
    imageUrl: "https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=600&q=80",
  },
};

export default function Storefront({
  initialSearch,
  initialCategory,
  initialProducts = [],
  initialCategories = productCategories,
  initialBrands = productBrands,
  initialTotal = 0,
}: StorefrontProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [sortBy, setSortBy] = useState<SortOption>("a-z");
  const [filters, setFilters] = useState<FilterState>({
    searchWithin: "",
    inStock: false,
    outOfStock: false,
    minPrice: "",
    maxPrice: "",
    selectedCategories: initialCategory ? [initialCategory] : [],
    selectedSubcategories: [],
    selectedBrands: [],
    minRating: null,
  });
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isFilterMobileOpen, setIsFilterMobileOpen] = useState(false);

  const [displayedProducts, setDisplayedProducts] = useState<Product[]>(initialProducts);
  const [categoriesList, setCategoriesList] = useState<string[]>(initialCategories);
  const [brandsList, setBrandsList] = useState<string[]>(initialBrands);
  const [totalCount, setTotalCount] = useState<number>(initialTotal || initialProducts.length);
  const [isLoading, setIsLoading] = useState(false);

  const hasHydrated = useCartStore((state) => state.hasHydrated);
  const items = useCartStore((state) => state.items);
  const increaseQuantity = useCartStore((state) => state.increaseQuantity);
  const decreaseQuantity = useCartStore((state) => state.decreaseQuantity);
  const removeProduct = useCartStore((state) => state.removeProduct);
  const clearCart = useCartStore((state) => state.clearCart);

  // Register products in memory cache so cart/wishlist can dereference them synchronously
  useEffect(() => {
    if (displayedProducts.length > 0) {
      registerProducts(displayedProducts);
    }
  }, [displayedProducts]);

  useEffect(() => {
    if (!isCartOpen) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCartOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isCartOpen]);

  // Fetch products dynamically from API when search / filters / sort change
  useEffect(() => {
    let isMounted = true;
    const fetchTimer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (searchTerm.trim()) params.set("search", searchTerm.trim());
        if (filters.selectedCategories.length > 0) {
          filters.selectedCategories.forEach((cat) => params.append("category", cat));
        }
        params.set("sortBy", sortBy);
        if (filters.inStock) params.set("inStock", "true");
        if (filters.outOfStock) params.set("outOfStock", "true");
        if (filters.minPrice) params.set("minPrice", filters.minPrice);
        if (filters.maxPrice) params.set("maxPrice", filters.maxPrice);
        params.set("limit", "300");

        const res = await fetch(`/api/products?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch products");

        const data = await res.json();
        if (isMounted) {
          setDisplayedProducts(data.products || []);
          if (data.categories && data.categories.length > 0) {
            setCategoriesList(data.categories);
          }
          if (data.brands && data.brands.length > 0) {
            setBrandsList(data.brands);
          }
          setTotalCount(data.total || (data.products ? data.products.length : 0));
          if (data.products) {
            registerProducts(data.products);
          }
        }
      } catch (err) {
        console.error("Error fetching filtered products:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(fetchTimer);
    };
  }, [searchTerm, sortBy, filters.selectedCategories, filters.inStock, filters.outOfStock, filters.minPrice, filters.maxPrice]);

  // Helper to derive subcategory for a product dynamically
  const getSubcategoryForProduct = (p: Product): string =>
    p.subcategory?.trim() || "";

  // Derive active category & metadata
  const activeCategory = filters.selectedCategories.length === 1 ? filters.selectedCategories[0] : (initialCategory || "");

  const categoryDefinition = ECOMMERCE_CATEGORY_BY_NAME.get(activeCategory);
  const categoryMeta: CategoryMeta | null = activeCategory
    ? categoryDefinition
      ? {
          title: categoryDefinition.name,
          description: categoryDefinition.description,
          imageUrl: categoryDefinition.imageUrl,
        }
      : CATEGORY_INFO_MAP[activeCategory] || {
          title: activeCategory,
          description: `Explore available ${activeCategory} products and industrial supplies for direct business order.`,
          imageUrl: "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=600&q=80",
        }
    : null;

  // Filter products matching active category for building subcategories
  const activeCategoryProducts = activeCategory
    ? displayedProducts.filter(p => p.category.trim().toLowerCase() === activeCategory.toLowerCase())
    : displayedProducts;

  // Build subcategories dictionary dynamically
  const subcategoryMap = new Map<string, { count: number; inStockCount: number }>();

  activeCategoryProducts.forEach((p) => {
    const subcatName = getSubcategoryForProduct(p);
    if (subcatName) {
      const existing = subcategoryMap.get(subcatName);
      if (existing) {
        existing.count++;
        if (p.stock > 0) existing.inStockCount++;
      } else {
        subcategoryMap.set(subcatName, {
          count: 1,
          inStockCount: p.stock > 0 ? 1 : 0,
        });
      }
    }
  });

  const categoryTypes = ECOMMERCE_CATEGORY_BY_NAME.get(activeCategory)?.types || [];
  const subcategoriesGridItems = categoryTypes.map((name) => {
    const meta = subcategoryMap.get(name);
    return {
      name,
      count: meta?.count || 0,
      inStockCount: meta?.inStockCount || 0,
      imageUrl: getEcommerceTypeImage(activeCategory),
    };
  });

  const availableSubcategoryNames = ECOMMERCE_SUBCATEGORY_NAMES;

  // Filter displayedProducts with searchWithin, selectedSubcategories, selectedBrands, minRating
  const finalFilteredProducts = displayedProducts.filter((p) => {
    if (filters.searchWithin && filters.searchWithin.trim()) {
      const q = filters.searchWithin.trim().toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchSku = p.sku.toLowerCase().includes(q);
      const matchDesc = p.description.toLowerCase().includes(q);
      if (!matchName && !matchSku && !matchDesc) return false;
    }

    if (filters.selectedSubcategories && filters.selectedSubcategories.length > 0) {
      const subcat = getSubcategoryForProduct(p).toLowerCase();
      const matchSubcat = filters.selectedSubcategories.some((s) =>
        s.toLowerCase() === subcat
      );
      if (!matchSubcat) return false;
    }

    if (filters.selectedBrands && filters.selectedBrands.length > 0) {
      if (!p.brand || !filters.selectedBrands.some(b => b.toLowerCase() === p.brand?.toLowerCase())) {
        return false;
      }
    }

    if (filters.minRating !== null && p.rating && p.rating < filters.minRating) {
      return false;
    }

    return true;
  });

  const cartLines = resolveCartLines(items);
  const itemCount = items.reduce((count, line) => count + line.quantity, 0);
  const subtotal = cartLines.reduce(
    (total, line) => total + line.product.price * line.quantity,
    0,
  );

  const suggestions = searchTerm.trim()
    ? finalFilteredProducts.slice(0, 5)
    : [];
  const hasProductRefinements = Boolean(
    searchTerm.trim() ||
    filters.searchWithin?.trim() ||
    filters.inStock ||
    filters.outOfStock ||
    filters.minPrice ||
    filters.maxPrice ||
    filters.selectedBrands.length > 0 ||
    filters.minRating !== null
  );
  const selectedTypesHaveProducts = filters.selectedSubcategories.length === 0 ||
    activeCategoryProducts.some((product) =>
      filters.selectedSubcategories.includes(getSubcategoryForProduct(product))
    );
  const categoryUnavailable = Boolean(
    activeCategory && activeCategoryProducts.length === 0 && !hasProductRefinements
  );
  const selectedTypeUnavailable = Boolean(
    activeCategory &&
      filters.selectedSubcategories.length > 0 &&
      !selectedTypesHaveProducts &&
      !hasProductRefinements
  );
  const showUnavailableState = categoryUnavailable || selectedTypeUnavailable;

  const hasActiveFilters =
    filters.inStock ||
    filters.outOfStock ||
    filters.minPrice !== "" ||
    filters.maxPrice !== "" ||
    filters.selectedCategories.length > 0 ||
    filters.selectedSubcategories.length > 0 ||
    filters.selectedBrands.length > 0 ||
    filters.minRating !== null ||
    !!filters.searchWithin ||
    searchTerm.trim() !== "";

  const activeFilterCount =
    (filters.inStock ? 1 : 0) +
    (filters.outOfStock ? 1 : 0) +
    (filters.minPrice !== "" ? 1 : 0) +
    (filters.maxPrice !== "" ? 1 : 0) +
    filters.selectedCategories.length +
    filters.selectedSubcategories.length +
    filters.selectedBrands.length +
    (filters.searchWithin ? 1 : 0) +
    (filters.minRating !== null ? 1 : 0);

  const handleClearAllFilters = () => {
    setFilters({
      searchWithin: "",
      inStock: false,
      outOfStock: false,
      minPrice: "",
      maxPrice: "",
      selectedCategories: [],
      selectedSubcategories: [],
      selectedBrands: [],
      minRating: null,
    });
    setSearchTerm("");
    setSortBy("a-z");
  };

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  return (
    <div className="store-shell">
      <SiteHeader currentPage="store" onCartClick={() => setIsCartOpen(true)} />

      <main>
        <PageContainer as="section" className="catalog scroll-reveal" id="catalog" aria-labelledby="catalog-title" style={{ paddingTop: "24px" }}>
          {/* CATEGORY HEADER BANNER (WHEN CATEGORY IS SELECTED) */}
          {categoryMeta ? (
            <div className="category-header-banner">
              <div className="category-header-content">
                <div className="category-header-image-wrap">
                  <img src={categoryMeta.imageUrl} alt={categoryMeta.title} className="category-header-img" />
                </div>
                <div className="category-header-text">
                  <h1 className="category-header-title">{categoryMeta.title}</h1>
                  <p className="category-header-desc">{categoryMeta.description}</p>
                  <span className="category-header-badge">
                    {activeCategoryProducts.length === 0
                      ? (hasProductRefinements ? "No matching products" : "Currently Unavailable")
                      : `${activeCategoryProducts.length} ${activeCategoryProducts.length === 1 ? "product" : "products"} · ${activeCategoryProducts.some((product) => product.stock > 0) ? "In Stock" : "Not in Stock"}`}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <SectionHeading
              eyebrow="Direct purchase"
              title="Products available for direct purchase"
              description="Browse industrial and business essentials with clear product details, INR pricing, and stock availability."
              id="catalog-title"
              aside={
                <form className="search-combobox" onSubmit={handleSearchSubmit}>
                  <FieldLabel className="search-field">
                    <span aria-hidden="true">⌕</span>
                    <Input
                      type="search"
                      name="search"
                      placeholder="Search products"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      aria-label="Search products"
                      aria-autocomplete="list"
                      aria-expanded={searchTerm.trim().length > 0}
                      aria-controls="product-search-suggestions"
                      autoComplete="off"
                    />
                  </FieldLabel>
                  {searchTerm.trim() && (
                    <div
                      className="search-suggestions"
                      id="product-search-suggestions"
                      role="listbox"
                      aria-label="Product suggestions"
                    >
                      {suggestions.length > 0 ? (
                        suggestions.map((product) => (
                          <Link
                            className="search-suggestion"
                            href={`/store/${product.id}`}
                            key={product.id}
                            role="option"
                            aria-selected="false"
                          >
                            <span>{product.name}</span>
                            <small>{product.sku} · {product.category}</small>
                          </Link>
                        ))
                      ) : (
                        <p className="search-suggestions__empty">No products found</p>
                      )}
                    </div>
                  )}
                </form>
              }
            />
          )}

          {/* VISUAL SUBCATEGORY CARDS GRID (FASTENAL-STYLE GRID) */}
          {activeCategory && subcategoriesGridItems.length > 0 && (
            <div className="subcategory-section">
              <div className="subcategory-section-header">
                <h3 className="subcategory-section-title">Subcategories in {categoryMeta?.title || activeCategory}</h3>
                {filters.selectedSubcategories.length > 0 && (
                  <button
                    type="button"
                    className="subcategory-reset-btn"
                    onClick={() => setFilters({ ...filters, selectedSubcategories: [] })}
                  >
                    Show All {activeCategory} Subcategories
                  </button>
                )}
              </div>

              <div className="subcategory-grid">
                {subcategoriesGridItems.map((subcat) => {
                  const isSelected = filters.selectedSubcategories.includes(subcat.name);
                  return (
                    <button
                      key={subcat.name}
                      type="button"
                      className={`subcategory-card ${isSelected ? "subcategory-card--selected" : ""}`}
                      onClick={() => {
                        const updated = isSelected
                          ? filters.selectedSubcategories.filter((s) => s !== subcat.name)
                          : [subcat.name];
                        setFilters({ ...filters, selectedSubcategories: updated });
                      }}
                      title={`Filter by ${subcat.name}`}
                    >
                      <div className="subcategory-card-image-wrap">
                        <img src={subcat.imageUrl} alt={subcat.name} className="subcategory-card-img" />
                      </div>
                      <div className="subcategory-card-info">
                        <span className="subcategory-card-name">{subcat.name}</span>
                        <span className="subcategory-card-count">
                          {subcat.count === 0
                            ? (hasProductRefinements ? "No matching products" : "Currently Unavailable")
                            : `${subcat.count} ${subcat.count === 1 ? "product" : "products"} · ${subcat.inStockCount > 0 ? "In Stock" : "Not in Stock"}`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="catalog-layout">
            {/* Desktop Filter Sidebar */}
            <div className="catalog-sidebar-desktop">
              <ProductFilterSidebar
                categories={categoriesList}
                subcategories={availableSubcategoryNames}
                brands={brandsList}
                filters={filters}
                onFilterChange={setFilters}
                onClearAll={handleClearAllFilters}
                hasActiveFilters={hasActiveFilters}
              />
            </div>

            {/* Catalog Main Content */}
            <div className="catalog-main-content">
              <div className="catalog-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div className="catalog-toolbar__left">
                  <button
                    type="button"
                    className="mobile-filter-toggle-btn"
                    onClick={() => setIsFilterMobileOpen(true)}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                    <span>Filters</span>
                    {activeFilterCount > 0 && (
                      <span className="mobile-filter-badge">{activeFilterCount}</span>
                    )}
                  </button>
                  <span className="catalog-products-count">
                    {showUnavailableState
                      ? "Currently Unavailable"
                      : `${finalFilteredProducts.length} ${finalFilteredProducts.length === 1 ? "product" : "products"} ${totalCount > finalFilteredProducts.length ? `(of ${totalCount})` : ""}`}
                  </span>
                </div>

                {/* Sort By Control */}
                <div className="catalog-toolbar__right" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <label htmlFor="store-sort-by" style={{ fontSize: "13px", fontWeight: "600", color: "#5c6b61" }}>
                    Sort by:
                  </label>
                  <select
                    id="store-sort-by"
                    className="ui-select"
                    style={{ minHeight: "36px", height: "36px", fontSize: "13px", paddingRight: "30px" }}
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortOption)}
                  >
                    <option value="a-z">A → Z</option>
                    <option value="z-a">Z → A</option>
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                  </select>
                </div>
              </div>

              {/* Active Filters Chips */}
              {hasActiveFilters && (
                <div className="active-filters" aria-label="Active filters">
                  {searchTerm && (
                    <span>
                      Search: <strong>{searchTerm}</strong>
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => setSearchTerm("")}
                      >
                        &times;
                      </button>
                    </span>
                  )}
                  {filters.searchWithin && (
                    <span>
                      Search within: <strong>{filters.searchWithin}</strong>
                      <button
                        type="button"
                        onClick={() => setFilters({ ...filters, searchWithin: "" })}
                      >
                        &times;
                      </button>
                    </span>
                  )}
                  {filters.inStock && (
                    <span>
                      In Stock
                      <button
                        type="button"
                        onClick={() => setFilters({ ...filters, inStock: false })}
                      >
                        &times;
                      </button>
                    </span>
                  )}
                  {filters.outOfStock && (
                    <span>
                      Out of Stock
                      <button
                        type="button"
                        onClick={() => setFilters({ ...filters, outOfStock: false })}
                      >
                        &times;
                      </button>
                    </span>
                  )}
                  {filters.selectedCategories.map((cat) => (
                    <span key={cat}>
                      Category: <strong>{cat}</strong>
                      <button
                        type="button"
                        onClick={() =>
                          setFilters({
                            ...filters,
                            selectedCategories: filters.selectedCategories.filter(
                              (c) => c !== cat
                            ),
                          })
                        }
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  {filters.selectedSubcategories.map((subcat) => (
                    <span key={subcat}>
                      Subcategory: <strong>{subcat}</strong>
                      <button
                        type="button"
                        onClick={() =>
                          setFilters({
                            ...filters,
                            selectedSubcategories: filters.selectedSubcategories.filter(
                              (s) => s !== subcat
                            ),
                          })
                        }
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  {filters.selectedBrands.map((b) => (
                    <span key={b}>
                      Brand: <strong>{b}</strong>
                      <button
                        type="button"
                        onClick={() =>
                          setFilters({
                            ...filters,
                            selectedBrands: filters.selectedBrands.filter(
                              (item) => item !== b
                            ),
                          })
                        }
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  {filters.minRating !== null && (
                    <span>
                      Rating: <strong>{filters.minRating}.0+ ★</strong>
                      <button
                        type="button"
                        onClick={() => setFilters({ ...filters, minRating: null })}
                      >
                        &times;
                      </button>
                    </span>
                  )}
                  {(filters.minPrice || filters.maxPrice) && (
                    <span>
                      Price: ₹{filters.minPrice || "0"} – ₹{filters.maxPrice || "∞"}
                      <button
                        type="button"
                        onClick={() => setFilters({ ...filters, minPrice: "", maxPrice: "" })}
                      >
                        &times;
                      </button>
                    </span>
                  )}
                  <button
                    type="button"
                    className="active-filters__clear"
                    onClick={handleClearAllFilters}
                  >
                    Clear all
                  </button>
                </div>
              )}

              <ProductGrid
                products={finalFilteredProducts}
                onClearFilters={handleClearAllFilters}
                emptyTitle={showUnavailableState ? "Currently Unavailable" : undefined}
                emptyDescription={
                  showUnavailableState
                    ? "There are no real products listed in this category or type right now."
                    : undefined
                }
              />
            </div>
          </div>
        </PageContainer>
      </main>

      <SiteFooter />

      {/* Mobile Filters Drawer */}
      <Drawer
        open={isFilterMobileOpen}
        title="Filters"
        description={`${displayedProducts.length} ${displayedProducts.length === 1 ? "product" : "products"} found`}
        onClose={() => setIsFilterMobileOpen(false)}
        className="filter-drawer"
        footer={
          <Button
            className="ui-button--primary"
            style={{ width: "100%" }}
            onClick={() => setIsFilterMobileOpen(false)}
          >
            View {displayedProducts.length} {displayedProducts.length === 1 ? "Product" : "Products"}
          </Button>
        }
      >
        <div style={{ padding: "16px" }}>
          <ProductFilterSidebar
            categories={categoriesList}
            brands={brandsList}
            filters={filters}
            onFilterChange={setFilters}
            onClearAll={handleClearAllFilters}
            hasActiveFilters={hasActiveFilters}
          />
        </div>
      </Drawer>

      <Drawer
        open={isCartOpen}
        title="Your cart"
        description={`${itemCount} ${itemCount === 1 ? "item" : "items"}`}
        onClose={() => setIsCartOpen(false)}
        className="cart-drawer"
        headerClassName="drawer-header"
        footerClassName="drawer-footer"
        footer={
          <>
            <div className="subtotal-row">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <p className="subtotal-note">Shipping and taxes calculated at checkout.</p>
            {items.length > 0 ? (
              <Link className="checkout-button checkout-link" href="/checkout">
                Checkout
              </Link>
            ) : (
              <Button className="checkout-button" type="button" disabled>
                Checkout
              </Button>
            )}
            <Button
              className="drawer-continue"
              variant="quiet"
              type="button"
              onClick={() => setIsCartOpen(false)}
            >
              Continue browsing
            </Button>
          </>
        }
      >
            {items.length === 0 ? (
              <EmptyState
                className="cart-empty"
                icon="+"
                title="Your cart is ready when you are."
                description="Browse the catalog and add a few essentials to get started."
              />
            ) : (
              <div className="cart-lines">
                <div className="cart-lines__toolbar">
                  <span>{itemCount} {itemCount === 1 ? "item" : "items"}</span>
                  <Button className="cart-clear" variant="quiet" onClick={clearCart}>
                    Clear cart
                  </Button>
                </div>
                {cartLines.map(({ product, quantity }) => (
                  <article className="cart-line" key={product.id}>
                    <div className="cart-line-image">
                      <Image
                        fill
                        sizes="76px"
                        src={product.imageUrl}
                        alt={product.imageAlt}
                      />
                    </div>
                    <div className="cart-line-main">
                      <div className="cart-line-top">
                        <div>
                          <h3>{product.name}</h3>
                          <span className="cart-line-sku">{product.sku}</span>
                          <span className="cart-line-unit-price">{formatPrice(product.price)} each</span>
                        </div>
                        <span className="cart-line-price">
                          {formatPrice(product.price * quantity)}
                        </span>
                      </div>
                      <div className="cart-line-bottom">
                        <div className="quantity-control" aria-label={`Quantity for ${product.name}`}>
                          <button
                            type="button"
                            disabled={quantity <= 1}
                            aria-label={`Decrease ${product.name} quantity`}
                            onClick={() => decreaseQuantity(product.id)}
                          >
                            &minus;
                          </button>
                          <span aria-live="polite">{quantity}</span>
                          <button
                            type="button"
                            aria-label={`Increase ${product.name} quantity`}
                            disabled={quantity >= product.stock}
                            onClick={() => increaseQuantity(product.id)}
                          >
                            +
                          </button>
                        </div>
                        <button
                          className="remove-button"
                          type="button"
                          onClick={() => removeProduct(product.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

      </Drawer>
    </div>
  );
}
