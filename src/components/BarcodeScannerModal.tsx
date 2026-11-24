import React, { useEffect, useRef, useState } from 'react';
import { Camera, ScanBarcode, X } from 'lucide-react';
import { Language, Product } from '../types/pos';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  products: Product[];
  lang: Language;
  onClose: () => void;
  onDetected: (barcode: string) => boolean;
}

interface DetectedBarcode {
  rawValue?: string;
}

interface BarcodeDetectorInstance {
  detect: (source: HTMLVideoElement) => Promise<DetectedBarcode[]>;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  products,
  lang,
  onClose,
  onDetected,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [lastScanned, setLastScanned] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    let rafId = 0;
    let lastDetectTime = 0;

    const stopCamera = () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setCameraActive(false);
    };

    const startCamera = async () => {
      setCameraError('');
      setFeedback('');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          lang === 'mm'
            ? 'ဤ Browser တွင် Camera စကန်ဖတ်ခြင်း မပံ့ပိုးပါ — အောက်တွင် Barcode ရိုက်ထည့်နိုင်ပါသည်။'
            : 'Camera access is unavailable in this browser — enter a barcode manually below.'
        );
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraActive(true);

        const BarcodeDetectorCtor = (
          window as unknown as {
            BarcodeDetector?: new (opts?: { formats: string[] }) => BarcodeDetectorInstance;
          }
        ).BarcodeDetector;

        if (!BarcodeDetectorCtor) {
          setCameraError(
            lang === 'mm'
              ? 'Camera ဖွင့်ထားသော်လည်း Auto BarcodeDetector မပါဝင်ပါ — USB Scanner သို့မဟုတ် အောက်မှ Code ရိုက်ထည့်ပါ။'
              : 'Camera active, but native BarcodeDetector API is unsupported here. Use a USB scanner or manual entry below.'
          );
          return;
        }

        const detector = new BarcodeDetectorCtor({
          formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'],
        });

        const scanLoop = async (ts: number) => {
          if (cancelled) return;
          if (videoRef.current && videoRef.current.readyState >= 2 && ts - lastDetectTime > 380) {
            lastDetectTime = ts;
            try {
              const results = await detector.detect(videoRef.current);
              if (results.length > 0 && results[0].rawValue) {
                const code = results[0].rawValue.trim();
                if (code && code !== lastScanned) {
                  setLastScanned(code);
                  const found = onDetected(code);
                  setFeedback(
                    found
                      ? lang === 'mm'
                        ? `✓ ${code} ကို စာရင်းထဲထည့်ပြီးပါပြီ`
                        : `✓ Added ${code} to cart`
                      : lang === 'mm'
                      ? `✕ ${code} ကို စတော့စာရင်းတွင် မတွေ့ပါ`
                      : `✕ Barcode ${code} not found`
                  );
                  setTimeout(() => {
                    if (!cancelled) setLastScanned('');
                  }, 1400);
                }
              }
            } catch {
              // Ignore single-frame decode errors
            }
          }
          rafId = requestAnimationFrame(scanLoop);
        };

        rafId = requestAnimationFrame(scanLoop);
      } catch {
        if (!cancelled) {
          setCameraError(
            lang === 'mm'
              ? 'Camera ခွင့်ပြုချက် မရရှိပါ — USB Barcode Scanner သို့မဟုတ် Manual Entry ကို အသုံးပြုပါ။'
              : 'Camera permission denied or no camera attached — use manual entry or USB scanner.'
          );
        }
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [isOpen, lang, lastScanned, onDetected]);

  if (!isOpen) return null;

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = manualCode.trim();
    if (!trimmed) return;
    const ok = onDetected(trimmed);
    setFeedback(
      ok
        ? lang === 'mm'
          ? `✓ ${trimmed} ကို အရောင်းစာရင်းထဲ ထည့်ပြီးပါပြီ`
          : `✓ Added ${trimmed} to current sale`
        : lang === 'mm'
        ? `✕ Barcode "${trimmed}" ကို မတွေ့ပါ`
        : `✕ Barcode "${trimmed}" not found in inventory`
    );
    if (ok) {
      setManualCode('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3.5">
          <div className="flex items-center gap-2 text-[var(--text-primary)]">
            <ScanBarcode className="w-5 h-5 text-[var(--accent-text)]" />
            <h2 className="text-base font-semibold">
              {lang === 'mm' ? 'Barcode စကန်ဖတ်ရန်' : 'Barcode Scanner'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-slate-900 flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full h-full object-cover ${cameraActive ? 'opacity-100' : 'opacity-0'}`}
            />
            {cameraActive && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-56 h-24 border-2 border-teal-400 rounded-lg shadow-[0_0_0_9999px_rgba(15,23,42,0.38)]" />
              </div>
            )}
            {!cameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-slate-300">
                <Camera className="w-8 h-8 mb-2 text-slate-400" />
                <p className="text-xs leading-relaxed">
                  {cameraError || (lang === 'mm' ? 'Camera ချိတ်ဆက်နေသည်...' : 'Initializing camera...')}
                </p>
              </div>
            )}
          </div>

          {cameraActive && cameraError && (
            <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
              {cameraError}
            </p>
          )}

          {feedback && (
            <div
              className={`rounded-lg px-3 py-2 text-xs font-medium border ${
                feedback.startsWith('✓')
                  ? 'bg-[var(--accent-soft)] border-[var(--accent-soft-border)] text-[var(--accent-text)]'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-300'
              }`}
            >
              {feedback}
            </div>
          )}

          <form onSubmit={handleManualSubmit} className="space-y-2">
            <label className="block text-xs font-medium text-[var(--text-secondary)]">
              {lang === 'mm' ? 'Barcode နံပါတ် ရိုက်ထည့်၍ စမ်းသပ်ရန်' : 'Manual Barcode Entry'}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="8850124001012"
                className="flex-1 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm font-mono-num focus:border-[var(--accent-primary)] focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--accent-primary-hover)] cursor-pointer whitespace-nowrap"
              >
                {lang === 'mm' ? 'ထည့်မည်' : 'Add'}
              </button>
            </div>
          </form>

          <div>
            <p className="text-[11px] font-medium text-[var(--text-muted)] mb-2">
              {lang === 'mm' ? 'အမြန်စမ်းသပ် Scan (Quick Test Barcodes)' : 'Quick Test Scan'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {products.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    const ok = onDetected(p.sku);
                    setFeedback(
                      ok
                        ? lang === 'mm'
                          ? `✓ ${p.nameMm} (+1)`
                          : `✓ ${p.nameEn} (+1)`
                        : lang === 'mm'
                        ? `✕ ${p.nameMm} စတော့မလုံလောက်ပါ`
                        : `✕ ${p.nameEn} out of stock`
                    );
                  }}
                  className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface-muted)] px-2.5 py-1.5 text-[11px] font-mono-num text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  {p.sku}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
