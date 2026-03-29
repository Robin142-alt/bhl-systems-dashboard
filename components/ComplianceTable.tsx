"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { markAsCompleted, createComplianceItem, deleteComplianceItem } from "@/app/actions";
import { SubmitButton } from "@/components/SubmitButton";

// Define the exact shape of the data
interface ComplianceItem {
  id: number;
  title: string;
  category: string;
  responsible: string;
  status: string;
  deadline: Date;
}

// Replaced 'any[]' with 'ComplianceItem[]'
export default function ComplianceTable({ items }: { items: ComplianceItem[] }) {
  return (
    <div className="space-y-10">
      {/* 1. THE ADD FORM CARD */}
      <section className="bg-gray-900/40 border border-gray-800 p-8 rounded-[2.5rem] shadow-2xl backdrop-blur-md">
        <h3 className="text-white font-black mb-6 flex items-center gap-2 text-xl tracking-tight">
          <Plus className="text-blue-500" /> Add New Requirement
        </h3>
        <form 
          action={async (formData) => {
            try {
              await createComplianceItem(formData);
              toast.success("Requirement added to BHL Roadmap!");
            } catch { 
              // Removed 'err' since it is not used
              toast.error("Failed to add requirement.");
            }
          }} 
          className="grid grid-cols-1 md:grid-cols-4 gap-4"
        >
          <input name="title" placeholder="Requirement Name" required className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-4 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all shadow-inner" />
          <input name="category" placeholder="Category" required className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-4 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all shadow-inner" />
          <input name="responsible" placeholder="Officer" required className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-4 text-white placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all shadow-inner" />
          <div className="flex gap-2">
            <input name="deadline" type="date" required className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-4 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition-all flex-grow shadow-inner" />
            <SubmitButton /> 
          </div>
        </form>
      </section>

      {/* 2. THE COMPLIANCE ROADMAP LIST */}
      <section className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden">
        <div className="p-10 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
          <h3 className="font-black text-2xl text-gray-900 tracking-tight">Compliance Roadmap</h3>
          <span className="text-[10px] font-black bg-gray-900 text-white px-3 py-1 rounded-full uppercase tracking-widest">Active Database</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400 border-b border-gray-50 bg-gray-50/30">
                <th className="px-10 py-6">Requirement</th>
                <th className="px-10 py-6">Officer</th>
                <th className="px-10 py-6 text-center">Status</th>
                <th className="px-10 py-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.length === 0 ? (
                <tr><td colSpan={4} className="py-20 text-center text-gray-400 font-bold uppercase tracking-widest">No active tasks found.</td></tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-blue-50/50 transition-colors group">
                    <td className="px-10 py-8">
                      <div className="flex flex-col">
                        <span className="font-black text-gray-900 text-lg leading-none">{item.title}</span>
                        <span className="text-[10px] text-blue-500 font-black uppercase tracking-widest mt-2">{item.category}</span>
                      </div>
                    </td>
                    <td className="px-10 py-8 text-sm text-gray-500 font-black italic tracking-tight">{item.responsible}</td>
                    <td className="px-10 py-8 text-center">
                      <span className={`inline-block px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest border-2 ${
                        item.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-10 py-8 text-right">
                      <div className="flex justify-end gap-3">
                        <button 
                          onClick={async () => {
                            await markAsCompleted(item.id);
                            toast.info("Status updated to Completed");
                          }}
                          className="bg-gray-900 text-white p-3 rounded-2xl hover:bg-emerald-600 transition-all shadow-xl active:scale-90 flex items-center justify-center"
                        >
                          <Check size={18} strokeWidth={3} />
                        </button>
                        
                        <button 
                          onClick={async () => {
                            if(confirm("Delete this requirement?")) {
                              await deleteComplianceItem(item.id);
                              toast.error("Item removed from database");
                            }
                          }}
                          className="bg-white text-gray-400 p-3 rounded-2xl border-2 border-gray-100 hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all active:scale-90 shadow-sm flex items-center justify-center"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}