"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { registerProducts, Product } from "../../store/products";

interface HeaderProductSearchProps {
  initialSearch?: string;
  category?: string;
}

export default function HeaderProductSearch({
  initialSearch = "",
  category = "",
}: HeaderProductSearchProps) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Product[]>([]);

  useEffect(() => {
    if (!search.trim()) {
      setSuggestions([]);
      return;
    }

    let isMounted = true;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(search.trim())}&limit=5`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.products) {
            setSuggestions(data.products);
            registerProducts(data.products);
          }
        }
      } catch (err) {
        console.error("Error fetching search suggestions:", err);
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [search]);

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsOpen(false);
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (category.trim()) params.set("category", category.trim());
    const query = params.toString();
    router.push(`/store${query ? `?${query}` : ""}`);
  };

  const clearSearch = () => {
    setSearch("");
    setIsOpen(false);
    setSuggestions([]);
    const params = new URLSearchParams();
    if (category.trim()) params.set("category", category.trim());
    const query = params.toString();
    router.push(`/store${query ? `?${query}` : ""}`);
  };

  return (
    <form className="header-product-search" role="search" onSubmit={submitSearch}>
      <div className="header-product-search__input-wrapper">
        <svg
          className="header-product-search__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>

        <input
          type="search"
          name="search"
          className="header-product-search__input"
          placeholder="Search products..."
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          aria-label="Search products"
          aria-autocomplete="list"
          aria-expanded={isOpen && search.trim().length > 0}
          aria-controls="header-search-suggestions"
          autoComplete="off"
        />

        {search && (
          <button
            className="header-product-search__clear"
            type="button"
            onClick={clearSearch}
            aria-label="Clear product search"
          >
            &times;
          </button>
        )}

        <button
          type="submit"
          className="header-product-search__submit-btn"
          aria-label="Submit search"
        >
          Search
        </button>
      </div>

      {isOpen && search.trim() && (
        <div
          className="header-product-search__suggestions"
          id="header-search-suggestions"
          role="listbox"
          aria-label="Product suggestions"
        >
          {suggestions.length ? (
            suggestions.map((product) => (
              <Link
                className="search-suggestion"
                href={`/store/${product.id}`}
                key={product.id}
                role="option"
                aria-selected="false"
                onClick={() => setIsOpen(false)}
              >
                <div className="search-suggestion__content">
                  <span className="search-suggestion__title">{product.name}</span>
                  <small className="search-suggestion__meta">
                    {product.sku} · {product.category}
                  </small>
                </div>
              </Link>
            ))
          ) : (
            <p className="search-suggestions__empty">No products found</p>
          )}
        </div>
      )}
    </form>
  );
}
