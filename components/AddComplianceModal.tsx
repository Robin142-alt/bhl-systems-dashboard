"use client";

import { toast } from "sonner";
import { createComplianceItem } from "@/app/actions";
import { SubmitButton } from "./SubmitButton";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export default function AddComplianceModal({ isOpen, onClose, onSuccess }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* HEADER */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="font-bold text-slate-800 text-lg">New Compliance Requirement</h2>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 transition-colors text-2xl"
          >
            &times;
          </button>
        </div>

        {/* FORM */}
        <form 
          action={async (formData: FormData) => {
            try {
              await createComplianceItem(formData);
              
              // CRITICAL FIX: Trigger the dashboard refresh
              await onSuccess(); 
              
              toast.success("Sync Complete: Requirement saved to BHL Database");
              onClose(); 
            } catch {
              // Removed unused 'err' to satisfy ESLint
              toast.error("Cloud Sync Failed. Please check your connection.");
            }
          }} 
          className="p-6 space-y-4"
        >
          {/* REQUIREMENT NAME */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1 tracking-wider">
              Requirement Name
            </label>
            <input 
              name="title"
              required
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="e.g., KRA VAT Filing"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* DEADLINE */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1 tracking-wider">
                Deadline
              </label>
              <input 
                name="deadline"
                required
                type="date"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {/* CATEGORY */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1 tracking-wider">
                Category
              </label>
              <select 
                name="category"
                defaultValue="Taxation"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="Taxation">Taxation</option>
                <option value="Legal">Legal</option>
                <option value="Licensing">Licensing</option>
                <option value="Operations">Operations</option>
              </select>
            </div>
          </div>

          {/* RESPONSIBLE OFFICER */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1 tracking-wider">
              Responsible Officer
            </label>
            <input 
              name="responsible"
              required
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Robinson Ondu"
            />
          </div>

          {/* ACTIONS */}
          <div className="pt-4 flex flex-col gap-3">
            <SubmitButton /> 
            <button 
              type="button"
              onClick={onClose}
              className="w-full py-3 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}