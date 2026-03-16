"use client";

type SessionScope = "user" | "admin";

const LEGACY_ACCESS_TOKEN_KEY = "access_token";
const LEGACY_REFRESH_TOKEN_KEY = "refresh_token";
const SCOPED_KEYS: Record<SessionScope, { access: string; refresh: string }> = {
  user: { access: "user_access_token", refresh: "user_refresh_token" },
  admin: { access: "admin_access_token", refresh: "admin_refresh_token" },
};

function inferSessionScope(): SessionScope {
  if (typeof window === "undefined") return "user";
  return window.location.pathname.startsWith("/admin") ? "admin" : "user";
}

function getScopedKeys(scope?: SessionScope) {
  return SCOPED_KEYS[scope ?? inferSessionScope()];
}

export function getStoredAccessToken() {
  if (typeof window === "undefined") return null;
  const keys = getScopedKeys();
  return localStorage.getItem(keys.access);
}

export function getStoredRefreshToken() {
  if (typeof window === "undefined") return null;
  const keys = getScopedKeys();
  return localStorage.getItem(keys.refresh);
}

export function setStoredTokens(tokens: { access_token: string; refresh_token: string }) {
  if (typeof window === "undefined") return;
  const keys = getScopedKeys();
  localStorage.setItem(keys.access, tokens.access_token);
  localStorage.setItem(keys.refresh, tokens.refresh_token);
  // Drop legacy shared keys to avoid cross-role session pollution.
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
}

export function clearStoredTokens() {
  if (typeof window === "undefined") return;
  const keys = getScopedKeys();
  localStorage.removeItem(keys.access);
  localStorage.removeItem(keys.refresh);
  localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
  localStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
}
