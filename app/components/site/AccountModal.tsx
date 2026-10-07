"use client";

import { useState } from "react";
import { Button, Drawer } from "../ui";

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AccountModal({ isOpen, onClose }: AccountModalProps) {
  const [tab, setTab] = useState<"signin" | "register">("signin");
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);

  // Form states
  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");

  const [regFullName, setRegFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regAddress, setRegAddress] = useState("");
  const [regCity, setRegCity] = useState("");
  const [regState, setRegState] = useState("");
  const [regPincode, setRegPincode] = useState("");
  const [regPassword, setRegPassword] = useState("");

  const [notice, setNotice] = useState("");

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!signInEmail) return;
    setUser({
      name: signInEmail.split("@")[0] || "Customer",
      email: signInEmail,
    });
    setNotice("Signed in successfully.");
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regEmail || !regFullName) return;
    setUser({
      name: regFullName,
      email: regEmail,
    });
    setNotice("Account created successfully!");
  };

  const handleGoogleAuth = () => {
    setNotice(
      "Google OAuth provider is ready for backend API client configuration (OAuth Client ID / Secrets required)."
    );
  };

  const handleSignOut = () => {
    setUser(null);
    setNotice("");
  };

  return (
    <Drawer
      open={isOpen}
      onClose={onClose}
      title={user ? `Account Overview` : tab === "signin" ? "Customer Sign In" : "Create Account"}
      description={user ? `Signed in as ${user.email}` : "Source Asia Direct Customer Portal"}
      className="account-modal-drawer"
    >
      <div className="account-modal-body">
        {user ? (
          <div className="account-logged-in">
            <div className="account-user-card">
              <div className="account-user-avatar">{user.name.charAt(0).toUpperCase()}</div>
              <div>
                <h3>{user.name}</h3>
                <p>{user.email}</p>
                <span className="ui-badge ui-badge--brand">Source Asia Direct Member</span>
              </div>
            </div>

            {notice && <p className="account-notice account-notice--success">{notice}</p>}

            <div className="account-actions-list">
              <Button
                variant="outline"
                type="button"
                className="w-full"
                onClick={handleSignOut}
              >
                Sign Out
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="account-tab-switcher">
              <button
                type="button"
                className={`account-tab-btn ${tab === "signin" ? "account-tab-btn--active" : ""}`}
                onClick={() => {
                  setTab("signin");
                  setNotice("");
                }}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`account-tab-btn ${tab === "register" ? "account-tab-btn--active" : ""}`}
                onClick={() => {
                  setTab("register");
                  setNotice("");
                }}
              >
                Create Account
              </button>
            </div>

            {notice && <p className="account-notice">{notice}</p>}

            {tab === "signin" ? (
              <form onSubmit={handleSignIn} className="account-form">
                <label className="ui-field">
                  <span className="ui-label">Email Address *</span>
                  <input
                    type="email"
                    required
                    className="ui-input"
                    placeholder="sales@company.com"
                    value={signInEmail}
                    onChange={(e) => setSignInEmail(e.target.value)}
                  />
                </label>

                <label className="ui-field">
                  <span className="ui-label">Password *</span>
                  <input
                    type="password"
                    required
                    className="ui-input"
                    placeholder="••••••••"
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                  />
                </label>

                <Button type="submit" className="account-submit-btn ui-button--primary">
                  Sign In
                </Button>

                <div className="account-divider">
                  <span>or</span>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  className="google-auth-btn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="account-form">
                <label className="ui-field">
                  <span className="ui-label">Full Name *</span>
                  <input
                    type="text"
                    required
                    className="ui-input"
                    placeholder="Rajesh Kumar"
                    value={regFullName}
                    onChange={(e) => setRegFullName(e.target.value)}
                  />
                </label>

                <label className="ui-field">
                  <span className="ui-label">Email Address *</span>
                  <input
                    type="email"
                    required
                    className="ui-input"
                    placeholder="sales@company.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                  />
                </label>

                <label className="ui-field">
                  <span className="ui-label">Phone Number *</span>
                  <input
                    type="tel"
                    required
                    className="ui-input"
                    placeholder="+91 98442 23703"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                  />
                </label>

                <label className="ui-field">
                  <span className="ui-label">Address</span>
                  <input
                    type="text"
                    className="ui-input"
                    placeholder="Industrial Zone, Plot 42"
                    value={regAddress}
                    onChange={(e) => setRegAddress(e.target.value)}
                  />
                </label>

                <div className="account-form-row">
                  <label className="ui-field">
                    <span className="ui-label">City</span>
                    <input
                      type="text"
                      className="ui-input"
                      placeholder="Bangalore"
                      value={regCity}
                      onChange={(e) => setRegCity(e.target.value)}
                    />
                  </label>
                  <label className="ui-field">
                    <span className="ui-label">State</span>
                    <input
                      type="text"
                      className="ui-input"
                      placeholder="Karnataka"
                      value={regState}
                      onChange={(e) => setRegState(e.target.value)}
                    />
                  </label>
                </div>

                <label className="ui-field">
                  <span className="ui-label">Pincode</span>
                  <input
                    type="text"
                    className="ui-input"
                    placeholder="560001"
                    value={regPincode}
                    onChange={(e) => setRegPincode(e.target.value)}
                  />
                </label>

                <label className="ui-field">
                  <span className="ui-label">Password *</span>
                  <input
                    type="password"
                    required
                    className="ui-input"
                    placeholder="••••••••"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                  />
                </label>

                <Button type="submit" className="account-submit-btn ui-button--primary">
                  Create Account
                </Button>

                <div className="account-divider">
                  <span>or</span>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleAuth}
                  className="google-auth-btn"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Continue with Google</span>
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
