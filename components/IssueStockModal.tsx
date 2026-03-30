"use client";

import { useState } from "react";
import { issueStock } from "@/lib/actions/issue-stock";
import { X, Loader2, ClipboardCheck } from "lucide-react";
import { InventoryItem } from "@prisma/client";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: InventoryItem[];
}

export default function IssueStockModal({ isOpen, onClose, items }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const result = await issueStock(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else {
      setLoading(false);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="p-6 bg-blue-600 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={20} />
            <h2 className="text-xl font-bold">Issue Stock / Items</h2>
          </div>
          <button onClick={onClose} className="hover:opacity-70"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-red-500 text-xs bg-red-50 p-3 rounded border border-red-100">{error}</p>}
          
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Select Item</label>
            <select name="itemId" required className="w-full px-4 py-2.5 border rounded-xl bg-white outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">-- Choose Item --</option>
              {items.map(item => (
                <option key={item.id} value={item.id} disabled={item.quantity === 0}>
                  {item.name} ({item.quantity} available)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Quantity to Issue</label>
            <input name="quantity" type="number" min="1" required className="w-full px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Reason / Purpose</label>
            <textarea name="reason" required rows={2} className="w-full px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="e.g., Given to new staff member as uniform" />
          </div>

          <button disabled={loading} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 mt-4">
            {loading ? <Loader2 className="animate-spin" /> : "Confirm Stock Issue"}
          </button>
        </form>
      </div>
    </div>
  );
}