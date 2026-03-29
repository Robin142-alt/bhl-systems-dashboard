"use client";

import { useState } from "react";
// Only importing what is actually used to prevent "never read" errors
import { Check, Trash2, Search } from "lucide-react"; 
import { markAsCompleted, deleteComplianceItem } from "./actions";

// 1. INTERFACE: ID is a number to match your Neon database
interface ComplianceItem {
  id: number; 
  title: string;
  category: string;
  responsible: string;
  status: string;
  deadline: Date | string;
  frequency?: string; 
}

export default function ComplianceTable({ items }: { items: ComplianceItem[] }) {
  const [query, setQuery] = useState("");

  // 2. SEARCH LOGIC: Filter by Title, Officer, or Category
  const filteredItems = items.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase()) ||
    item.responsible.toLowerCase().includes(query.toLowerCase()) ||
    item.category.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <section className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
      
      {/* HEADER SECTION WITH SEARCH BAR */}
      <div className="p-10 border-b border-gray-50 bg-gray-50/50 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h3 className="font-black text-2xl text-gray-900 tracking-tight">Compliance Roadmap</h3>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Live Inventory</p>
        </div>
        
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text"
            placeholder="Search requirements..."
            className="w-full pl-12 pr-4 py-4 bg-white border-2 border-gray-100 rounded-2xl text-gray-900 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all shadow-sm font-bold placeholder:text-gray-300"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* TABLE SECTION */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400 border-b border-gray-50 bg-gray-50/30">
              <th className="px-10 py-6">Requirement</th>
              <th className="px-10 py-6 text-center">Status</th>
              <th className="px-10 py-6 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-24 text-center">
                  <p className="font-black uppercase tracking-widest text-gray-300">No matching records found</p>
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                  <td className="px-10 py-8">
                    <div className="flex flex-col">
                      <span className="font-black text-gray-900 text-lg leading-none mb-2">{item.title}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-blue-600 font-black uppercase tracking-widest bg-blue-50 px-2 py-1 rounded-md border border-blue-100">
                          {item.category}
                        </span>
                        <span className="text-[10px] text-gray-400 font-bold uppercase italic">
                          {item.frequency || "One-off"}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-10 py-8 text-center">
                    <span className={`inline-block px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border-2 ${
                      item.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                    }`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-10 py-8 text-right">
                    <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      
                      {/* COMPLETE ACTION */}
                      <form action={async () => { await markAsCompleted(item.id); }}>
                        <button type="submit" className="bg-gray-900 text-white p-3 rounded-2xl hover:bg-emerald-600 transition-all shadow-xl flex items-center justify-center">
                          <Check size={18} strokeWidth={3} />
                        </button>
                      </form>

                      {/* DELETE ACTION */}
                      <form 
                        action={async () => { await deleteComplianceItem(item.id); }} 
                        onSubmit={(e) => { if (!confirm("Delete permanently?")) e.preventDefault(); }}
                      >
                        <button type="submit" className="bg-white text-gray-400 p-3 rounded-2xl border-2 border-gray-100 hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center">
                          <Trash2 size={18} />
                        </button>
                      </form>

                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}