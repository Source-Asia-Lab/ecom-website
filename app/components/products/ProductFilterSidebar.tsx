"use client";

import { useState } from "react";

export interface FilterState {
  searchWithin?: string;
  inStock: boolean;
  outOfStock: boolean;
  minPrice: string;
  maxPrice: string;
  selectedCategories: string[];
  selectedSubcategories: string[];
  selectedBrands: string[];
  minRating: number | null;
}

interface ProductFilterSidebarProps {
  categories: string[];
  subcategories?: string[];
  brands: string[];
  filters: FilterState;
  onFilterChange: (newFilters: FilterState) => void;
  onClearAll: () => void;
  hasActiveFilters: boolean;
}

export default function ProductFilterSidebar({
  categories,
  subcategories = [],
  brands,
  filters,
  onFilterChange,
  onClearAll,
  hasActiveFilters,
}: ProductFilterSidebarProps) {
  const [openSections, setOpenSections] = useState({
    searchWithin: true,
    availability: true,
    subcategory: true,
    price: true,
    category: true,
    brand: true,
    rating: true,
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const handleSearchWithinChange = (val: string) => {
    onFilterChange({
      ...filters,
      searchWithin: val,
    });
  };

  const handleAvailabilityChange = (type: "inStock" | "outOfStock") => {
    onFilterChange({
      ...filters,
      [type]: !filters[type],
    });
  };

  const handleCategoryToggle = (categoryName: string) => {
    const isSelected = filters.selectedCategories.includes(categoryName);
    const updated = isSelected
      ? filters.selectedCategories.filter((c) => c !== categoryName)
      : [...filters.selectedCategories, categoryName];

    onFilterChange({
      ...filters,
      selectedCategories: updated,
    });
  };

  const handleSubcategoryToggle = (subcatName: string) => {
    const isSelected = filters.selectedSubcategories.includes(subcatName);
    const updated = isSelected
      ? filters.selectedSubcategories.filter((s) => s !== subcatName)
      : [...filters.selectedSubcategories, subcatName];

    onFilterChange({
      ...filters,
      selectedSubcategories: updated,
    });
  };

  const handleBrandToggle = (brandName: string) => {
    const isSelected = filters.selectedBrands.includes(brandName);
    const updated = isSelected
      ? filters.selectedBrands.filter((b) => b !== brandName)
      : [...filters.selectedBrands, brandName];

    onFilterChange({
      ...filters,
      selectedBrands: updated,
    });
  };

  const handleRatingToggle = (ratingValue: number) => {
    onFilterChange({
      ...filters,
      minRating: filters.minRating === ratingValue ? null : ratingValue,
    });
  };

  const handleMinPriceChange = (val: string) => {
    onFilterChange({
      ...filters,
      minPrice: val,
    });
  };

  const handleMaxPriceChange = (val: string) => {
    onFilterChange({
      ...filters,
      maxPrice: val,
    });
  };

  const clearPriceFilter = () => {
    onFilterChange({
      ...filters,
      minPrice: "",
      maxPrice: "",
    });
  };

  const minVal = parseFloat(filters.minPrice);
  const maxVal = parseFloat(filters.maxPrice);
  const isPriceInvalid = !isNaN(minVal) && !isNaN(maxVal) && minVal > maxVal;

  return (
    <aside className="filter-sidebar" aria-label="Product filters">
      <div className="filter-sidebar__header">
        <h3 className="filter-sidebar__title">Filters</h3>
        {hasActiveFilters && (
          <button
            type="button"
            className="filter-sidebar__clear-btn"
            onClick={onClearAll}
          >
            Clear all
          </button>
        )}
      </div>

      {/* SEARCH WITHIN FILTER */}
      <div className="filter-group">
        <button
          type="button"
          className="filter-group__header"
          onClick={() => toggleSection("searchWithin")}
          aria-expanded={openSections.searchWithin}
        >
          <span>Search Within</span>
          <span className="filter-group__chevron">
            {openSections.searchWithin ? "▲" : "▼"}
          </span>
        </button>
        {openSections.searchWithin && (
          <div className="filter-group__content">
            <div className="filter-search-within-wrap" style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Search term(s)"
                value={filters.searchWithin || ""}
                onChange={(e) => handleSearchWithinChange(e.target.value)}
                className="ui-input"
                style={{ height: "36px", fontSize: "13px", paddingLeft: "10px", paddingRight: "30px" }}
              />
              {filters.searchWithin && (
                <button
                  type="button"
                  onClick={() => handleSearchWithinChange("")}
                  style={{
                    position: "absolute",
                    right: "8px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#888",
                    fontSize: "14px"
                  }}
                >
                  &times;
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 1. AVAILABILITY SECTION */}
      <div className="filter-group">
        <button
          type="button"
          className="filter-group__header"
          onClick={() => toggleSection("availability")}
          aria-expanded={openSections.availability}
        >
          <span>Availability</span>
          <span className="filter-group__chevron">
            {openSections.availability ? "▲" : "▼"}
          </span>
        </button>
        {openSections.availability && (
          <div className="filter-group__content">
            <label className="filter-checkbox-label">
              <input
                type="checkbox"
                checked={filters.inStock}
                onChange={() => handleAvailabilityChange("inStock")}
              />
              <span>In Stock</span>
            </label>
            <label className="filter-checkbox-label">
              <input
                type="checkbox"
                checked={filters.outOfStock}
                onChange={() => handleAvailabilityChange("outOfStock")}
              />
              <span>Out of Stock</span>
            </label>
          </div>
        )}
      </div>

      {/* 2. SUBCATEGORY SECTION */}
      {subcategories.length > 0 && (
        <div className="filter-group">
          <button
            type="button"
            className="filter-group__header"
            onClick={() => toggleSection("subcategory")}
            aria-expanded={openSections.subcategory}
          >
            <span>Subcategory</span>
            <span className="filter-group__chevron">
              {openSections.subcategory ? "▲" : "▼"}
            </span>
          </button>
          {openSections.subcategory && (
            <div className="filter-group__content">
              {subcategories.map((subcat) => {
                const isChecked = filters.selectedSubcategories.includes(subcat);
                return (
                  <label key={subcat} className="filter-checkbox-label">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleSubcategoryToggle(subcat)}
                    />
                    <span>{subcat}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. CATEGORY SECTION */}
      <div className="filter-group">
        <button
          type="button"
          className="filter-group__header"
          onClick={() => toggleSection("category")}
          aria-expanded={openSections.category}
        >
          <span>Category</span>
          <span className="filter-group__chevron">
            {openSections.category ? "▲" : "▼"}
          </span>
        </button>
        {openSections.category && (
          <div className="filter-group__content">
            {categories.map((cat) => {
              const isChecked = filters.selectedCategories.includes(cat);
              return (
                <label key={cat} className="filter-checkbox-label">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleCategoryToggle(cat)}
                  />
                  <span>{cat}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. BRAND SECTION */}
      {brands.length > 0 && (
        <div className="filter-group">
          <button
            type="button"
            className="filter-group__header"
            onClick={() => toggleSection("brand")}
            aria-expanded={openSections.brand}
          >
            <span>Brand</span>
            <span className="filter-group__chevron">
              {openSections.brand ? "▲" : "▼"}
            </span>
          </button>
          {openSections.brand && (
            <div className="filter-group__content">
              {brands.map((b) => {
                const isChecked = filters.selectedBrands.includes(b);
                return (
                  <label key={b} className="filter-checkbox-label">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleBrandToggle(b)}
                    />
                    <span>{b}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. PRICE SECTION */}
      <div className="filter-group">
        <button
          type="button"
          className="filter-group__header"
          onClick={() => toggleSection("price")}
          aria-expanded={openSections.price}
        >
          <span>Price (₹)</span>
          <span className="filter-group__chevron">
            {openSections.price ? "▲" : "▼"}
          </span>
        </button>
        {openSections.price && (
          <div className="filter-group__content">
            <div className="filter-price-inputs">
              <div className="filter-price-field">
                <span className="filter-currency-symbol">₹</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Min"
                  value={filters.minPrice}
                  onChange={(e) => handleMinPriceChange(e.target.value)}
                  className="filter-price-input"
                  aria-label="Minimum price"
                />
              </div>
              <span className="filter-price-separator">to</span>
              <div className="filter-price-field">
                <span className="filter-currency-symbol">₹</span>
                <input
                  type="number"
                  min="0"
                  placeholder="Max"
                  value={filters.maxPrice}
                  onChange={(e) => handleMaxPriceChange(e.target.value)}
                  className="filter-price-input"
                  aria-label="Maximum price"
                />
              </div>
            </div>
            {(filters.minPrice || filters.maxPrice) && (
              <div className="filter-price-actions" style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <button
                  type="button"
                  className="filter-sidebar__clear-btn"
                  onClick={clearPriceFilter}
                  style={{ fontSize: "12px", color: "var(--sa-danger)" }}
                >
                  Clear Price
                </button>
              </div>
            )}
            {isPriceInvalid && (
              <p className="filter-price-error">
                Min price cannot be greater than max price
              </p>
            )}
          </div>
        )}
      </div>

      {/* 5. PRODUCT RATING SECTION */}
      <div className="filter-group">
        <button
          type="button"
          className="filter-group__header"
          onClick={() => toggleSection("rating")}
          aria-expanded={openSections.rating}
        >
          <span>Customer Rating</span>
          <span className="filter-group__chevron">
            {openSections.rating ? "▲" : "▼"}
          </span>
        </button>
        {openSections.rating && (
          <div className="filter-group__content">
            <label className="filter-checkbox-label">
              <input
                type="radio"
                name="rating"
                checked={filters.minRating === 5}
                onChange={() => handleRatingToggle(5)}
              />
              <span style={{ color: "#d97706", fontWeight: "600" }}>★★★★★</span>
              <span>5.0</span>
            </label>
            <label className="filter-checkbox-label">
              <input
                type="radio"
                name="rating"
                checked={filters.minRating === 4}
                onChange={() => handleRatingToggle(4)}
              />
              <span style={{ color: "#d97706", fontWeight: "600" }}>★★★★☆</span>
              <span>4.0 & above</span>
            </label>
            <label className="filter-checkbox-label">
              <input
                type="radio"
                name="rating"
                checked={filters.minRating === 3}
                onChange={() => handleRatingToggle(3)}
              />
              <span style={{ color: "#d97706", fontWeight: "600" }}>★★★☆☆</span>
              <span>3.0 & above</span>
            </label>
          </div>
        )}
      </div>
    </aside>
  );
}
