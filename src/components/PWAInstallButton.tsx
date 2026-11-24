import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Language } from '../types/pos';

interface PWAInstallButtonProps {
  lang: Language;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ lang }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="w-full flex items-center justify-center gap-2 rounded-lg border border-[var(--accent-soft-border)] bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--accent-text)] hover:bg-[var(--accent-soft-hover)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{lang === 'mm' ? 'App အဖြစ် Install လုပ်မည်' : 'Install Offline App'}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{lang === 'mm' ? 'iPhone/iPad တွင်ထည့်မည်' : 'Install on iOS'}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-sm rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-6 shadow-xl">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">
                {lang === 'mm' ? 'iPhone / iPad တွင် App ထည့်သွင်းနည်း' : 'Install on iPhone / iPad'}
              </h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                {lang === 'mm' ? (
                  <>
                    ၁။ Safari အောက်ခြေရှိ <strong>Share</strong> ခလုတ်ကို နှိပ်ပါ။<br />
                    ၂။ အောက်သို့ဆွဲချပြီး <strong>Add to Home Screen</strong> ကို ရွေးချယ်ပါ။
                  </>
                ) : (
                  <>
                    1. Tap the <strong>Share</strong> button in the Safari toolbar.<br />
                    2. Scroll down and tap <strong>Add to Home Screen</strong>.
                  </>
                )}
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full rounded-lg bg-[var(--accent-primary)] py-2 text-sm font-medium text-white hover:bg-[var(--accent-primary-hover)] cursor-pointer"
              >
                {lang === 'mm' ? 'နားလည်ပါပြီ' : 'Close'}
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
