"use client";

import { useEffect, useState, useRef, useId, useCallback } from "react";
import { useDeliveryStore, DeliveryLocationDetails } from "../../store/delivery-store";

export interface PostalResult {
  pincode: string;
  postOffice: string;
  district: string;
  state: string;
}

interface PincodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyPincode?: (pincode: string, details?: PostalResult) => void;
  currentPincode?: string;
}

export default function PincodeModal({
  isOpen,
  onClose,
  onApplyPincode,
  currentPincode = "",
}: PincodeModalProps) {
  const setStorePincode = useDeliveryStore((state) => state.setPincode);
  const storePincode = useDeliveryStore((state) => state.pincode);

  const [inputVal, setInputVal] = useState(currentPincode || storePincode || "");
  const [results, setResults] = useState<PostalResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");

  const titleId = useId();
  const subtextId = useId();
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Synchronize initial pincode when modal opens
  useEffect(() => {
    if (isOpen) {
      const activeCode = currentPincode || storePincode || "";
      setInputVal(activeCode);
      setErrorMsg("");
      setResults([]);
      setSearchedQuery("");
      // Auto focus input
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, currentPincode, storePincode]);

  // Handle ESC key press
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Handle Click Outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use setTimeout so the click that opened the popover doesn't immediately close it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Debounced real API search
  const performSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 3) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/pincode?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json();

      if (data.status === "OK" && Array.isArray(data.results)) {
        setResults(data.results);
        setSearchedQuery(trimmed);
        setErrorMsg("");
      } else if (data.status === "NOT_FOUND") {
        setResults([]);
        setSearchedQuery(trimmed);
        // Only show not found error if user searched for exact 6-digit pin
        if (/^[1-9][0-9]{5}$/.test(trimmed)) {
          setErrorMsg("PIN code not found. Please check and try again.");
        }
      } else if (data.status === "ERROR") {
        setResults([]);
        setErrorMsg("Unable to load PIN code information. Please try again.");
      }
    } catch (e) {
      console.error("Fetch pincode error:", e);
      setResults([]);
      setErrorMsg("Unable to load PIN code information. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced input change handler
  useEffect(() => {
    if (!isOpen) return;
    const trimmed = inputVal.trim();

    if (trimmed.length < 3) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    const timer = setTimeout(() => {
      performSearch(trimmed);
    }, 280);

    return () => clearTimeout(timer);
  }, [inputVal, isOpen, performSearch]);

  if (!isOpen) {
    return null;
  }

  const handleSelectResult = (item: PostalResult) => {
    const code = item.pincode;
    setStorePincode(code, item);
    if (onApplyPincode) {
      onApplyPincode(code, item);
    }
    onClose();
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputVal.trim();

    // 1. Validation for invalid Indian pincode format
    if (!trimmed || !/^[1-9][0-9]{5}$/.test(trimmed)) {
      setErrorMsg("Please enter a valid Indian PIN code.");
      return;
    }

    // 2. If results already loaded for this pincode
    const match = results.find((r) => r.pincode === trimmed);
    if (match) {
      handleSelectResult(match);
      return;
    }

    // 3. Otherwise fetch pincode info directly
    setIsLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch(`/api/pincode?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json();

      if (data.status === "OK" && Array.isArray(data.results) && data.results.length > 0) {
        const item = data.results[0];
        handleSelectResult(item);
      } else if (data.status === "NOT_FOUND") {
        setErrorMsg("PIN code not found. Please check and try again.");
      } else {
        setErrorMsg("Unable to load PIN code information. Please try again.");
      }
    } catch {
      setErrorMsg("Unable to load PIN code information. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      ref={popoverRef}
      className="pincode-popover-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={subtextId}
    >
      <div className="pincode-popover-header">
        <h2 id={titleId} className="pincode-popover-title">
          Select your delivery location
        </h2>
        <button
          type="button"
          className="pincode-popover-close-btn"
          onClick={onClose}
          aria-label="Close delivery location popover"
        >
          &times;
        </button>
      </div>

      <form onSubmit={handleFormSubmit} className="pincode-popover-form" noValidate>
        <div className="pincode-input-wrapper">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pincode-search-icon"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className={`pincode-input ${errorMsg ? "pincode-input--error" : ""}`}
            placeholder="Enter 6-digit pincode"
            value={inputVal}
            onChange={(e) => {
              setInputVal(e.target.value);
              if (errorMsg) setErrorMsg("");
            }}
            aria-label="Enter 6-digit pincode or city name"
          />
          {inputVal && (
            <button
              type="button"
              className="pincode-clear-btn"
              onClick={() => {
                setInputVal("");
                setResults([]);
                setErrorMsg("");
                inputRef.current?.focus();
              }}
              aria-label="Clear input"
            >
              &times;
            </button>
          )}
          <button type="submit" className="pincode-apply-btn" disabled={isLoading}>
            {isLoading ? "Searching..." : "Apply"}
          </button>
        </div>

        {/* Loading indicator */}
        {isLoading && (
          <div className="pincode-loading-bar">
            <span className="pincode-spinner" />
            <span>Searching...</span>
          </div>
        )}

        {/* Error message */}
        {errorMsg && (
          <p className="pincode-validation-error" role="alert">
            {errorMsg}
          </p>
        )}

        {/* Autocomplete / Search Results */}
        {!isLoading && results.length > 0 && (
          <div className="pincode-results-list" role="listbox">
            <div className="pincode-results-label">Select location:</div>
            {results.map((item, idx) => (
              <button
                key={`${item.pincode}-${item.postOffice}-${idx}`}
                type="button"
                className="pincode-result-item"
                onClick={() => handleSelectResult(item)}
                role="option"
                aria-selected={inputVal === item.pincode}
              >
                <div className="pincode-result-badge">{item.pincode}</div>
                <div className="pincode-result-details">
                  <div className="pincode-result-name">{item.postOffice}</div>
                  <div className="pincode-result-sub">
                    {[item.district, item.state].filter(Boolean).join(", ")}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Empty state when query searched but no results */}
        {!isLoading && !errorMsg && searchedQuery && results.length === 0 && (
          <p className="pincode-no-results">
            No matching postal location found for &quot;{searchedQuery}&quot;.
          </p>
        )}
      </form>
    </div>
  );
}
