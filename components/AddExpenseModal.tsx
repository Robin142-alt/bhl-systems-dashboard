"use client";

import { useState } from "react";
import axios from "axios";

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: string; // "Utility", "Maintenance", or "Supplies"
}

export default function AddExpenseModal({ isOpen, onClose, category }: ExpenseModalProps) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await axios.post("/api/expenses", { category, description, amount });
      alert("Expense logged successfully!");
      onClose();
    } catch (err: unknown) {
      // FIX: We are now explicitly using 'err' to log the issue for developers
      console.error(`Failed to log ${category} expense:`, err);
      
      // We still show a clean alert to the user
      alert("Failed to log expense. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6 border-b bg-slate-900 text-white">
          <h2 className="text-lg font-bold">Log {category}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700">Description</label>
            <input 
              required
              className="w-full p-2.5 border border-slate-200 rounded-lg mt-1 focus:ring-2 focus:ring-slate-900 outline-none transition"
              placeholder={category === "Utility" ? "e.g., KPLC Tokens" : "Details..."}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700">Amount (KES)</label>
            <input 
              type="number"
              required
              className="w-full p-2.5 border border-slate-200 rounded-lg mt-1 focus:ring-2 focus:ring-slate-900 outline-none transition"
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button 
              type="button" 
              onClick={onClose} 
              className="flex-1 py-2.5 text-slate-500 font-medium hover:bg-slate-50 rounded-xl transition"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={loading} 
              className="flex-1 py-2.5 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}