import { Language } from '../types/pos';

export function formatMMK(amount: number, lang: Language): string {
  const formatted = Math.round(amount).toLocaleString('en-US');
  return lang === 'mm' ? `${formatted} ကျပ်` : `${formatted} Ks`;
}

export function formatDateTime(iso: string, lang: Language): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(lang === 'mm' ? 'en-GB' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function generateBarcode(): string {
  const prefix = '885';
  const body = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('');
  const digits = (prefix + body).split('').map(Number);
  const sum = digits.reduce((acc, d, idx) => acc + d * (idx % 2 === 0 ? 1 : 3), 0);
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${prefix}${body}${checkDigit}`;
}

export function playBeep(type: 'scan' | 'success' | 'error' = 'scan'): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'scan') {
      osc.frequency.value = 1150;
      gain.gain.value = 0.05;
      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    } else if (type === 'success') {
      osc.frequency.value = 880;
      gain.gain.value = 0.06;
      osc.start();
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.08);
      osc.stop(ctx.currentTime + 0.18);
    } else {
      osc.frequency.value = 320;
      gain.gain.value = 0.06;
      osc.start();
      osc.stop(ctx.currentTime + 0.14);
    }
  } catch {
    // Audio playback optional when browser blocks autoplay
  }
}

export function downloadCSV(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csvBody = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join('\n');
  const blob = new Blob(['\uFEFF' + csvBody], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
