"use client";

import { useState } from "react";
import { addMaintenanceLog } from "@/app/lib/actions/maintenance";
import { X, Loader2, Wrench } from "lucide-react"; // Removed 'Calendar'
import { Asset, Vendor } from "@prisma/client";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  assets: Asset[];
  vendors: Vendor[];
}

export default function AddMaintenanceModal({ isOpen, onClose, assets, vendors }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const result = await addMaintenanceLog(formData);

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
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="p-6 bg-amber-600 text-white flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Wrench size={20} />
            <h2 className="text-xl font-bold text-white">Log Maintenance Work</h2>
          </div>
          <button onClick={onClose} className="hover:opacity-70 text-white"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded border border-red-100">{error}</p>}
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Select Asset</label>
              <select name="assetId" required className="w-full px-4 py-2.5 border rounded-xl bg-white outline-none focus:ring-2 focus:ring-amber-500">
                <option value="">-- Choose Asset --</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Service Vendor</label>
              <select name="vendorId" className="w-full px-4 py-2.5 border rounded-xl bg-white outline-none focus:ring-2 focus:ring-amber-500">
                <option value="">Select Vendor (Optional)</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Cost (KES)</label>
              <input name="cost" type="number" required className="w-full px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-amber-500" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Next Service Date</label>
              <input name="nextServiceDate" type="date" className="w-full px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-amber-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Description of Work</label>
            <textarea name="description" required rows={3} className="w-full px-4 py-2.5 border rounded-xl outline-none focus:ring-2 focus:ring-amber-500 resize-none" placeholder="e.g. Changed oil, replaced oil filter and rotated tires." />
          </div>

          <button disabled={loading} className="w-full bg-amber-600 text-white font-bold py-4 rounded-xl hover:bg-amber-700 transition-all shadow-lg flex items-center justify-center gap-2 mt-4">
            {loading ? <Loader2 className="animate-spin" /> : "Save Maintenance Record"}
          </button>
        </form>
      </div>
    </div>
  );
}