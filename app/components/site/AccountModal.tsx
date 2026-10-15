"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { Button, Drawer } from "../ui";

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AccountOrder {
  order_number: string;
  status: string;
  payment_status: string;
  currency: string;
  total_amount: string | number;
  created_at: string;
}

export default function AccountModal({ isOpen, onClose }: AccountModalProps) {
  const { data: session, status } = useSession();
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [ordersLoadedFor, setOrdersLoadedFor] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState("");
  const [authError, setAuthError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);

  useEffect(() => {
    const email = session?.user?.email;
    if (!isOpen || !email) return;

    const controller = new AbortController();

    fetch("/api/account/orders", { signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as {
          orders?: AccountOrder[];
          error?: string;
        };
        if (!response.ok) throw new Error(result.error || "Could not load orders.");
        setOrders(Array.isArray(result.orders) ? result.orders : []);
        setOrdersLoadedFor(email);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setOrdersError(error instanceof Error ? error.message : "Could not load orders.");
        }
      })

    return () => controller.abort();
  }, [isOpen, session?.user?.email]);

  const handleGoogleSignIn = async () => {
    setAuthError("");
    setIsSigningIn(true);
    try {
      await signIn("google", { redirectTo: window.location.href });
    } catch {
      setAuthError("Google sign-in could not be started. Please try again.");
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut({ redirectTo: window.location.pathname });
  };

  const user = session?.user;
  const ordersLoading = Boolean(isOpen && user?.email && ordersLoadedFor !== user.email && !ordersError);

  return (
    <Drawer
      open={isOpen}
      onClose={onClose}
      title={user ? "Account Overview" : "Customer Account"}
      description={user?.email ? `Signed in as ${user.email}` : "Sign in securely with Google"}
      className="account-modal-drawer"
    >
      <div className="account-modal-body">
        {status === "loading" ? (
          <p role="status">Checking your session...</p>
        ) : user ? (
          <div className="account-logged-in">
            <div className="account-user-card">
              <div className="account-user-avatar" aria-hidden="true">
                {(user.name || user.email || "C").charAt(0).toUpperCase()}
              </div>
              <div>
                <h3>{user.name || "Customer"}</h3>
                <p>{user.email}</p>
                <span className="ui-badge ui-badge--brand">
                  {user.role === "staff" ? "Staff" : "Google account verified"}
                </span>
              </div>
            </div>

            <section className="account-orders" aria-labelledby="account-orders-title">
              <h3 id="account-orders-title">Your recent orders</h3>
              {ordersLoading ? (
                <p role="status">Loading orders...</p>
              ) : ordersError ? (
                <p className="account-notice" role="alert">{ordersError}</p>
              ) : orders.length === 0 ? (
                <p>No orders are associated with this Google account yet.</p>
              ) : (
                <ul className="account-orders__list">
                  {orders.map((order) => (
                    <li className="account-orders__item" key={order.order_number}>
                      <div>
                        <strong>{order.order_number}</strong>
                        <span>{new Date(order.created_at).toLocaleDateString("en-IN")}</span>
                      </div>
                      <div>
                        <span>{order.status} / {order.payment_status}</span>
                        <strong>
                          {new Intl.NumberFormat("en-IN", {
                            style: "currency",
                            currency: order.currency,
                          }).format(Number(order.total_amount))}
                        </strong>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Button variant="outline" type="button" className="w-full" onClick={handleSignOut}>
              Sign Out
            </Button>
            {user.role === "staff" && <Link className="support-action-btn support-action-btn--outline" href="/admin">Open operations workspace</Link>}
          </div>
        ) : (
          <div className="account-form">
            <p>Use your verified Google account to sign in or create your customer account.</p>
            {authError && <p className="account-notice" role="alert">{authError}</p>}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              className="google-auth-btn"
              disabled={isSigningIn}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>{isSigningIn ? "Redirecting to Google..." : "Continue with Google"}</span>
            </button>
          </div>
        )}
      </div>
    </Drawer>
  );
}