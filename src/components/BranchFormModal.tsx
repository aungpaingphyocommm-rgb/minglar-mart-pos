import React, { useEffect, useState } from 'react';
import { Store, X } from 'lucide-react';
import { Branch, Language } from '../types/pos';

interface BranchFormModalProps {
  isOpen: boolean;
  editingBranch: Branch | null;
  lang: Language;
  onClose: () => void;
  onSave: (branch: Branch) => Promise<void>;
}

export const BranchFormModal: React.FC<BranchFormModalProps> = ({
  isOpen,
  editingBranch,
  lang,
  onClose,
  onSave,
}) => {
  const [code, setCode] = useState('');
  const [nameMm, setNameMm] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [phone, setPhone] = useState('');
  const [addressMm, setAddressMm] = useState('');
  const [addressEn, setAddressEn] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    if (editingBranch) {
      setCode(editingBranch.code);
      setNameMm(editingBranch.nameMm);
      setNameEn(editingBranch.nameEn);
      setPhone(editingBranch.phone);
      setAddressMm(editingBranch.addressMm);
      setAddressEn(editingBranch.addressEn);
    } else {
      setCode(`BR-${Math.floor(10 + Math.random() * 89)}`);
      setNameMm('');
      setNameEn('');
      setPhone('');
      setAddressMm('');
      setAddressEn('');
    }
  }, [isOpen, editingBranch]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameMm.trim() && !nameEn.trim()) {
      setError(lang === 'mm' ? 'ဆိုင်ခွဲအမည် ထည့်သွင်းပါ' : 'Please enter a branch name');
      return;
    }
    if (!code.trim()) {
      setError(lang === 'mm' ? 'ဆိုင်ခွဲကုဒ် ထည့်သွင်းပါ' : 'Please enter a branch code');
      return;
    }

    setSaving(true);
    try {
      const branch: Branch = {
        id: editingBranch ? editingBranch.id : `branch-${Date.now()}`,
        code: code.trim().toUpperCase(),
        nameMm: nameMm.trim() || nameEn.trim(),
        nameEn: nameEn.trim() || nameMm.trim(),
        phone: phone.trim() || '09-000 000 000',
        addressMm: addressMm.trim() || addressEn.trim(),
        addressEn: addressEn.trim() || addressMm.trim(),
        isMain: editingBranch ? editingBranch.isMain : false,
        createdAt: editingBranch ? editingBranch.createdAt : new Date().toISOString(),
      };
      await onSave(branch);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-lg rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-[var(--accent-text)]" />
            <h2 className="text-base font-semibold">
              {editingBranch
                ? lang === 'mm'
                  ? 'ဆိုင်ခွဲအချက်အလက် ပြင်ဆင်ရန်'
                  : 'Edit Store Branch'
                : lang === 'mm'
                ? 'ဆိုင်ခွဲအသစ် ထည့်သွင်းရန်'
                : 'Add New Store Branch'}
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

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {lang === 'mm' ? 'ဆိုင်ခွဲကုဒ် (Code)' : 'Branch Code'}
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="YGN-03"
                className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm font-mono-num focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {lang === 'mm' ? 'ဖုန်းနံပါတ်' : 'Branch Phone'}
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="09-789 456 789"
                className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm font-mono-num focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {lang === 'mm' ? 'ဆိုင်ခွဲအမည် (မြန်မာ)' : 'Branch Name (Myanmar)'}
              </label>
              <input
                type="text"
                value={nameMm}
                onChange={(e) => setNameMm(e.target.value)}
                placeholder="ဥပမာ - ဆိုင်ခွဲ ၃ (တာမွေ)"
                className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {lang === 'mm' ? 'ဆိုင်ခွဲအမည် (English)' : 'Branch Name (English)'}
              </label>
              <input
                type="text"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
                placeholder="e.g. Branch 3 (Tamwe)"
                className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {lang === 'mm' ? 'လိပ်စာ (မြန်မာ)' : 'Address (Myanmar)'}
              </label>
              <input
                type="text"
                value={addressMm}
                onChange={(e) => setAddressMm(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                {lang === 'mm' ? 'လိပ်စာ (English)' : 'Address (English)'}
              </label>
              <input
                type="text"
                value={addressEn}
                onChange={(e) => setAddressEn(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] px-3 py-2 text-sm focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-surface-muted)] cursor-pointer"
            >
              {lang === 'mm' ? 'မလုပ်တော့ပါ' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--accent-primary)] px-5 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-primary-hover)] disabled:opacity-50 cursor-pointer"
            >
              {lang === 'mm' ? 'သိမ်းဆည်းမည်' : 'Save Branch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
