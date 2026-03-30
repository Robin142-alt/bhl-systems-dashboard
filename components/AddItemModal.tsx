"use client";

import { useState } from "react";
import { addInventoryItem } from "@/lib/actions/inventory";
import { X, Loader2, PackagePlus } from "lucide-react";

export default function AddItemModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const result = await addInventoryItem(formData);

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
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4">
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <PackagePlus size={20} />
            <h2 className="text-xl font-bold">New Inventory Item</h2>
          </div>
          <button onClick={onClose} className="hover:text-slate-300"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-red-500 text-xs bg-red-50 p-3 rounded border border-red-100">{error}</p>}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Item Name</label>
              <input name="name" required className="w-full px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-slate-900" placeholder="e.g. BHL Branded Hoodie (L)" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Category</label>
              <select name="category" required className="w-full px-4 py-2.5 border rounded-xl bg-white outline-none focus:ring-2 focus:ring-slate-900">
                <option value="Merchandise">Merchandise</option>
                <option value="Office Supplies">Office Supplies</option>
                <option value="Electronics">Electronics</option>
                <option value="Marketing">Marketing Material</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">SKU / Code</label>
              <input name="sku" className="w-full px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-slate-900" placeholder="BHL-001" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Initial Qty</label>
              <input name="quantity" type="number" required className="w-full px-4 py-2.5 border rounded-xl outline-none" placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Min Alert</label>
              <input name="minQuantity" type="number" required className="w-full px-4 py-2.5 border rounded-xl outline-none" placeholder="5" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Price (KES)</label>
              <input name="unitPrice" type="number" step="0.01" className="w-full px-4 py-2.5 border rounded-xl outline-none" placeholder="0.00" />
            </div>
          </div>

          <button disabled={loading} className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-black transition-all flex items-center justify-center gap-2 mt-4 shadow-lg shadow-slate-200">
            {loading ? <Loader2 className="animate-spin" /> : "Add to Stockroom"}
          </button>
        </form>
      </div>
    </div>
  );
}