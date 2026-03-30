"use client";

import { useState } from "react";
import { addExpense } from "@/lib/actions/expense";
import { X, Loader2 } from "lucide-react";
import { Vendor } from "@prisma/client";

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendors: Vendor[]; // Strictly typed to expect the Prisma Vendor model
}

export default function AddExpenseModal({ isOpen, onClose, vendors }: ExpenseModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await addExpense(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setLoading(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b bg-slate-900 text-white flex justify-between items-center">
          <h2 className="text-lg font-bold">Log Office Expense</h2>
          <button onClick={onClose} className="hover:text-slate-300 transition-colors">
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-red-500 text-xs bg-red-50 p-2 rounded border border-red-100">{error}</p>}
          
          <div>
            <label className="block text-sm font-semibold text-slate-700">Category</label>
            <select name="category" required className="w-full p-2.5 border border-slate-200 rounded-lg mt-1 outline-none focus:ring-2 focus:ring-slate-900 bg-white">
              <option value="Utility">Utility (KPLC/Water)</option>
              <option value="Maintenance">Maintenance</option>
              <option value="Supplies">Office Supplies</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">Amount (KES)</label>
            <input name="amount" type="number" step="0.01" required className="w-full p-2.5 border border-slate-200 rounded-lg mt-1 outline-none focus:ring-2 focus:ring-slate-900" placeholder="0.00" />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">Vendor</label>
            <select name="vendorId" className="w-full p-2.5 border border-slate-200 rounded-lg mt-1 outline-none focus:ring-2 focus:ring-slate-900 bg-white">
              <option value="">Select Vendor (Optional)</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700">Description</label>
            <textarea name="description" required rows={2} className="w-full p-2.5 border border-slate-200 rounded-lg mt-1 outline-none focus:ring-2 focus:ring-slate-900 resize-none" placeholder="e.g., KPLC Tokens for HQ" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 text-slate-500 font-medium hover:bg-slate-50 rounded-xl transition">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition disabled:opacity-50 flex justify-center items-center">
              {loading ? <Loader2 className="animate-spin" size={20} /> : "Save Expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}