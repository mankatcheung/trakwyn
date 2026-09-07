import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import i18n from './index';
import {
  SUPPORTED_LANGUAGES,
  type LanguageCode,
  type LanguageMode,
  type LanguageOption,
} from './config';
import { detectDeviceLanguage } from './detectDeviceLanguage';
import { getLanguageMode, setLanguageMode as persistLanguageMode } from './languageStorage';

interface LanguageContextValue {
  mode: LanguageMode;
  resolvedLanguage: LanguageCode;
  supportedLanguages: LanguageOption[];
  setMode: (mode: LanguageMode) => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<LanguageMode>('system');

  useEffect(() => {
    let cancelled = false;
    void getLanguageMode().then((stored) => {
      if (!cancelled && stored) setModeState(stored);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = (next: LanguageMode) => {
    setModeState(next);
    void persistLanguageMode(next);
  };

  const resolvedLanguage: LanguageCode = mode === 'system' ? detectDeviceLanguage() : mode;

  useEffect(() => {
    void i18n.changeLanguage(resolvedLanguage);
  }, [resolvedLanguage]);

  const value = useMemo<LanguageContextValue>(
    () => ({ mode, resolvedLanguage, supportedLanguages: SUPPORTED_LANGUAGES, setMode }),
    [mode, resolvedLanguage],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage must be used within a LanguageProvider');
  return context;
}
