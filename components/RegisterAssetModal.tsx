"use client";

import { useState } from "react";
import { registerAsset } from "@/lib/actions/asset";
import { X, Loader2, Car, Monitor } from "lucide-react";

export default function RegisterAssetModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assetType, setAssetType] = useState("VEHICLE");

  if (!isOpen) return null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const result = await registerAsset(formData);

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
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
          <h2 className="text-xl font-bold">Register New BHL Asset</h2>
          <button onClick={onClose} className="hover:opacity-70"><X size={24} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded border border-red-100">{error}</p>}
          
          <div className="flex p-1 bg-slate-100 rounded-xl">
            <button 
              type="button"
              onClick={() => setAssetType("VEHICLE")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${assetType === "VEHICLE" ? "bg-white shadow-sm text-blue-600" : "text-slate-500"}`}
            >
              <Car size={16} /> Vehicle
            </button>
            <button 
              type="button"
              onClick={() => setAssetType("EQUIPMENT")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${assetType === "EQUIPMENT" ? "bg-white shadow-sm text-blue-600" : "text-slate-500"}`}
            >
              <Monitor size={16} /> Equipment
            </button>
            <input type="hidden" name="type" value={assetType} />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              {assetType === "VEHICLE" ? "Plate Number / Name" : "Asset Name"}
            </label>
            <input name="name" required className="w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder={assetType === "VEHICLE" ? "e.g. KDM 123X" : "e.g. HP LaserJet 400"} />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
              {assetType === "VEHICLE" ? "Chassis / Engine No." : "Serial Number"}
            </label>
            <input name="serialNumber" className="w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" placeholder="Optional" />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Current Status</label>
            <select name="status" className="w-full px-4 py-2.5 border rounded-xl focus:ring-2 focus:ring-blue-500 outline-none bg-white">
              <option value="OPERATIONAL">Operational</option>
              <option value="MAINTENANCE">Under Maintenance</option>
              <option value="REPAIR_NEEDED">Needs Repair</option>
            </select>
          </div>

          <button disabled={loading} className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl hover:bg-blue-700 transition-all shadow-lg flex items-center justify-center gap-2 mt-4">
            {loading ? <Loader2 className="animate-spin" /> : "Complete Registration"}
          </button>
        </form>
      </div>
    </div>
  );
}