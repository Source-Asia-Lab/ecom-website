"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import CartIndicator from "../cart/CartIndicator";
import BrandLogo from "./BrandLogo";
import HeaderProductSearch from "./HeaderProductSearch";
import AccountModal from "./AccountModal";
import WishlistDrawer from "./WishlistDrawer";
import PincodeModal from "./PincodeModal";
import { useWishlistStore } from "../../store/wishlist-store";
import { useDeliveryStore } from "../../store/delivery-store";

interface SiteHeaderProps {
  currentPage?: "home" | "store" | "support";
  onCartClick?: () => void;
}

export default function SiteHeader({ currentPage = "home", onCartClick }: SiteHeaderProps) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isCatDropdownOpen, setIsCatDropdownOpen] = useState(false);
  const [isPincodeModalOpen, setIsPincodeModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const deliveryPincode = useDeliveryStore((state) => state.pincode);
  const setDeliveryPincode = useDeliveryStore((state) => state.setPincode);
  const initializeDelivery = useDeliveryStore((state) => state.initialize);

  const productIds = useWishlistStore((state) => state.productIds);
  const wishlistCount = productIds.length;

  const [categoriesList, setCategoriesList] = useState<string[]>([]);
  const [isCategoriesLoading, setIsCategoriesLoading] = useState(true);

  useEffect(() => {
    initializeDelivery();
  }, [initializeDelivery]);

  useEffect(() => {
    let isMounted = true;
    fetch("/api/categories")
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && Array.isArray(data.categories)) {
          setCategoriesList(data.categories);
        }
      })
      .catch((err) => {
        console.error("Error fetching categories for header:", err);
      })
      .finally(() => {
        if (isMounted) {
          setIsCategoriesLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCatDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleApplyPincode = (code: string) => {
    setDeliveryPincode(code);
  };

  return (
    <>
      <header className="site-header-wrapper">
        {/* Top Announcement Bar - Kept Dark Green */}
        <div className="top-announcement-bar" role="region" aria-label="Announcement">
          <div className="top-announcement-content">
            <span className="announcement-badge">SOURCE ASIA DIRECT</span>
            <span className="announcement-text">QUALITY INDUSTRIAL PRODUCTS</span>
            <span className="announcement-divider">•</span>
            <span className="announcement-highlight">B2B ORDERS</span>
          </div>
        </div>

        {/* Main Header - Pale Light Green Background */}
        <div className="main-header-row">
          <div className="main-header-container">
            {/* LEFT: Logo & Deliver To Location */}
            <div className="header-left-group">
              <Link className="brand" href="/" aria-label="Source Asia home">
                <BrandLogo />
              </Link>

              <div className="header-deliver-to-wrapper">
                <button
                  type="button"
                  className={`header-deliver-to-btn ${isPincodeModalOpen ? "header-deliver-to-btn--active" : ""}`}
                  onClick={() => setIsPincodeModalOpen((prev) => !prev)}
                  aria-label={`Deliver to location: ${deliveryPincode || "Enter Pincode"}`}
                  aria-expanded={isPincodeModalOpen}
                  title="Select delivery location"
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
                    className="deliver-to-icon"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <div className="deliver-to-text">
                    <span className="deliver-to-label">Deliver to</span>
                    <strong className="deliver-to-pincode">
                      {deliveryPincode ? deliveryPincode : "Enter Pincode"}
                    </strong>
                  </div>
                </button>

                {/* Interactive Pincode Popover */}
                <PincodeModal
                  isOpen={isPincodeModalOpen}
                  onClose={() => setIsPincodeModalOpen(false)}
                  onApplyPincode={handleApplyPincode}
                  currentPincode={deliveryPincode}
                />
              </div>
            </div>

            {/* CENTER: Search Bar */}
            <div className="header-search-container">
              <HeaderProductSearch />
            </div>

            {/* RIGHT: User, Wishlist, Cart Icons */}
            <div className="header-user-actions">
              <button
                type="button"
                className="header-icon-action"
                aria-label="Account"
                title="Account / Sign In"
                onClick={() => setIsAccountOpen(true)}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span className="header-icon-action__label">Account</span>
              </button>

              <button
                type="button"
                className="header-icon-action header-wishlist-trigger"
                aria-label={`Wishlist, ${wishlistCount} items`}
                title="Wishlist"
                onClick={() => setIsWishlistOpen(true)}
              >
                <div className="header-icon-badge-wrap">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill={wishlistCount > 0 ? "#e11d48" : "none"}
                    stroke={wishlistCount > 0 ? "#e11d48" : "currentColor"}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l8.78-8.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  <span className="header-badge-count">{wishlistCount}</span>
                </div>
                <span className="header-icon-action__label">Wishlist</span>
              </button>

              <CartIndicator onClick={onCartClick} />
            </div>
          </div>
        </div>

        {/* Navigation Below Header - Pale Light Green Background */}
        <nav className="sub-header-navigation" aria-label="Main category navigation">
          <div className="sub-header-navigation__inner">
            <Link
              href="/"
              className="sub-header-nav__link"
              aria-current={currentPage === "home" ? "page" : undefined}
            >
              Home
            </Link>

            <Link
              href="/store"
              className="sub-header-nav__link"
              aria-current={currentPage === "store" ? "page" : undefined}
            >
              Products
            </Link>

            <div
              ref={dropdownRef}
              className={`sub-header-nav__dropdown ${
                isCatDropdownOpen ? "sub-header-nav__dropdown--open" : ""
              }`}
              onMouseEnter={() => setIsCatDropdownOpen(true)}
              onMouseLeave={() => setIsCatDropdownOpen(false)}
            >
              <button
                type="button"
                className="sub-header-nav__link sub-header-nav__dropdown-trigger"
                onClick={() => setIsCatDropdownOpen((prev) => !prev)}
                aria-expanded={isCatDropdownOpen}
              >
                Categories
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {isCatDropdownOpen && (
                <div className="sub-header-nav__menu" role="menu">
                  {categoriesList.length > 0 ? (
                    categoriesList.map((cat) => (
                      <Link
                        key={cat}
                        href={`/store?category=${encodeURIComponent(cat)}`}
                        onClick={() => setIsCatDropdownOpen(false)}
                        role="menuitem"
                      >
                        {cat}
                      </Link>
                    ))
                  ) : (
                    <span
                      style={{
                        display: "block",
                        padding: "10px 16px",
                        fontSize: "13px",
                        color: "#617066",
                      }}
                    >
                      {isCategoriesLoading ? "Loading..." : "No categories available"}
                    </span>
                  )}
                </div>
              )}
            </div>

            <Link
              href="/support"
              className="sub-header-nav__link"
              aria-current={currentPage === "support" ? "page" : undefined}
            >
              Support
            </Link>
          </div>
        </nav>
      </header>

      {/* Account Modal */}
      <AccountModal
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
      />

      {/* Wishlist Drawer */}
      <WishlistDrawer
        isOpen={isWishlistOpen}
        onClose={() => setIsWishlistOpen(false)}
      />
    </>
  );
}






