"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createTrainingItem } from "@/app/actions";
import { SubmitButton } from "./SubmitButton";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

export default function AddTrainingModal({ isOpen, onClose, onSuccess }: Props) {
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* HEADER */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-blue-50">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">Schedule Training</h2>
            <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest mt-0.5">
              BHL Compliance Module
            </p>
          </div>
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
            setError(null); // Reset error state
            
            // 1. FRONT-END BUDGET ENFORCEMENT (Functionality Maintained)
            const cost = parseFloat(formData.get("costKES") as string);
            if (cost > 5000) {
              setError("Budget Alert: Maximum allowed is KES 5,000 per session.");
              return;
            }

            try {
              // 2. SERVER ACTION
              await createTrainingItem(formData);
              
              // 3. REFRESH & CLOSE
              await onSuccess(); 
              toast.success("Training session scheduled successfully!");
              onClose(); 
            } catch {
              setError("Cloud Sync Failed. Please check your connection.");
            }
          }} 
          className="p-6 space-y-4"
        >
          {/* ERROR DISPLAY (Functionality Maintained) */}
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-xs rounded-xl border border-red-100 font-medium animate-shake">
              {error}
            </div>
          )}

          {/* TRAINING TITLE */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1 tracking-wider">
              Course / Training Title
            </label>
            <input 
              name="title"
              required
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="e.g., KASNEB CPD Seminar"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* START DATE */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1 tracking-wider">
                Start Date
              </label>
              <input 
                name="startDate"
                required
                type="date"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {/* COST KES */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1 tracking-wider">
                Cost (KES)
              </label>
              <input 
                name="costKES"
                required
                type="number"
                min="0"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Max 5,000"
              />
            </div>
          </div>

          {/* LOCATION (Functionality Maintained) */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1 tracking-wider">
              Location
            </label>
            <input 
              name="location"
              required
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., Ruiru Main Campus"
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
              Discard
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}