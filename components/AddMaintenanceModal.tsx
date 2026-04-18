"use client";

import { addMaintenanceLog } from "@/app/actions";
import { X, Loader2, Wrench } from "lucide-react"; 
import { Asset, Vendor } from "@prisma/client";
import { useFormStatus } from "react-dom";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  assets: Asset[];
  vendors: Vendor[];
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} type="submit" className="w-full bg-amber-600 text-white font-bold py-4 rounded-xl hover:bg-amber-700 transition-all shadow-lg flex items-center justify-center gap-2 mt-4">
      {pending ? <Loader2 className="animate-spin" /> : "Save Maintenance Record"}
    </button>
  );
}

export default function AddMaintenanceModal({ isOpen, onClose, assets, vendors }: Props) {
  if (!isOpen) return null;

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

        <form action={addMaintenanceLog} className="p-6 space-y-4">
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

          <SubmitButton />
        </form>
      </div>
    </div>
  );
}