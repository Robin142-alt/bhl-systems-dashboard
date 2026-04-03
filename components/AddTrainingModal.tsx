"use client";

import { useState } from "react";
import axios from "axios";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddComplianceModal({ isOpen, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  const [formData, setFormData] = useState({
    title: "",
    deadline: "",
    category: "Regulatory", // Default
    responsible: "Admin",    // Default
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // API CALL to your compliance endpoint
      await axios.post("/api/compliance", {
        ...formData,
        status: "Pending" // New items always start as Pending
      });

      onSuccess(); // Refresh Dashboard stats
      onClose();   // Close Modal
      // Reset form
      setFormData({ title: "", deadline: "", category: "Regulatory", responsible: "Admin" });
    } catch (err) {
      console.error("Compliance Sync Error:", err);
      setError("Database Sync Failed. Ensure all fields are valid.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* HEADER */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="font-black text-slate-800 text-lg uppercase tracking-tighter">New Requirement</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
              BHL Operational Tracker
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-800 text-2xl">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-4">
          
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-[10px] rounded-xl border border-red-100 font-black uppercase text-center">
              {error}
            </div>
          )}

          {/* REQUIREMENT TITLE */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 ml-1 tracking-widest">Requirement Name</label>
            <input 
              required
              className="w-full p-4 bg-slate-50 border-2 border-transparent focus:border-blue-500 rounded-2xl outline-none transition-all font-bold text-slate-800 text-sm"
              placeholder="e.g. VAT Returns Filing"
              value={formData.title}
              onChange={(e) => setFormData({...formData, title: e.target.value})}
            />
          </div>

          {/* DEADLINE DATE */}
          <div>
            <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 ml-1 tracking-widest">Deadline</label>
            <input 
              type="date" 
              required
              className="w-full bg-slate-50 p-4 rounded-2xl outline-none font-bold text-slate-800 text-sm border-2 border-transparent focus:border-blue-500"
              value={formData.deadline}
              onChange={(e) => setFormData({...formData, deadline: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* CATEGORY DROPDOWN */}
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 ml-1 tracking-widest">Category</label>
              <select 
                className="w-full bg-slate-50 p-4 rounded-2xl outline-none font-bold text-slate-800 text-sm appearance-none cursor-pointer"
                value={formData.category}
                onChange={(e) => setFormData({...formData, category: e.target.value})}
              >
                <option value="Regulatory">Regulatory</option>
                <option value="Taxation">Taxation</option>
                <option value="Licensing">Licensing</option>
                <option value="Operations">Operations</option>
              </select>
            </div>

            {/* RESPONSIBLE DROPDOWN */}
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 mb-1 ml-1 tracking-widest">Assignee</label>
              <select 
                className="w-full bg-slate-50 p-4 rounded-2xl outline-none font-bold text-slate-800 text-sm appearance-none cursor-pointer"
                value={formData.responsible}
                onChange={(e) => setFormData({...formData, responsible: e.target.value})}
              >
                <option value="Admin">Admin HQ</option>
                <option value="Finance">Finance Team</option>
                <option value="Operations">Ops Lead</option>
                <option value="Legal">Legal Desk</option>
              </select>
            </div>
          </div>

          {/* ACTIONS */}
          <div className="pt-4 flex flex-col gap-2">
            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-slate-900 transition-all shadow-xl shadow-blue-100 disabled:opacity-50"
            >
              {loading ? "Registering..." : "Add to Dashboard"}
            </button>
            <button 
              type="button"
              onClick={onClose}
              className="w-full py-3 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}