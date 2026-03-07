"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_LOCALE,
  formatDateTime,
  getStoredLocale,
  type Locale,
  setStoredLocale,
  t,
} from "@/lib/locale";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale, options?: { persist?: boolean }) => void;
  translate: (key: string, vars?: Record<string, string | number>) => string;
  formatDate: (value: string) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(getStoredLocale());
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  function setLocale(nextLocale: Locale, options?: { persist?: boolean }) {
    setLocaleState(nextLocale);
    if (options?.persist !== false) {
      setStoredLocale(nextLocale);
    }
  }

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      translate: (key, vars) => t(locale, key, vars),
      formatDate: (value) => formatDateTime(value, locale),
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used inside LocaleProvider");
  }
  return context;
}
