"use client"; // This tells Next.js this button runs in the browser

import { Download } from "lucide-react";

export default function PrintButton() {
  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <button 
      onClick={handlePrint} 
      className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg print:hidden"
    >
      <Download size={18} /> Export PDF Report
    </button>
  );
}