"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
// Ensure these files exist in your /components folder
import AddTrainingModal from "@/components/AddTrainingModal";
import AddComplianceModal from "@/components/AddComplianceModal";
// Ensure this file exists in /app/actions.ts
import { markAsCompleted, deleteComplianceItem } from "@/app/actions";

// 1. MODULAR INTERFACES
interface ComplianceItem {
  id: string | number; // Support both string (JSON) and number (Prisma)
  title: string;
  deadline: string;
  status: string;
  responsible: string;
  category: string;
}

interface Training {
  id: string | number;
  title: string;
  startDate: string;
  costKES: number; 
  status: string;
}

export default function Dashboard() {
  const [compliance, setCompliance] = useState<ComplianceItem[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCompModalOpen, setIsCompModalOpen] = useState(false);

  // 2. CALCULATED STATS
  const stats = useMemo(() => {
    return {
      total: compliance.length,
      pending: compliance.filter(item => item.status === "Pending").length,
      completed: compliance.filter(item => item.status === "Completed").length,
    };
  }, [compliance]);

  // 3. FETCH DATA FUNCTION
  const fetchData = useCallback(async () => {
    try {
      const [compRes, trainRes] = await Promise.allSettled([
        axios.get("/api/compliance"),
        axios.get("/api/training")
      ]);

      if (compRes.status === 'fulfilled') {
        setCompliance(compRes.value.data);
      }
      if (trainRes.status === 'fulfilled') {
        setTrainings(trainRes.value.data);
      }
    } catch (err) {
      console.error("Global Dashboard Sync Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="p-8 bg-slate-50 min-h-screen relative">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold text-slate-900 mb-2">BHL Business Hub</h1>
          <p className="text-slate-500">Kenya Regulatory & Operations Dashboard • Ruiru HQ</p>
        </header>

        {/* 4. SUMMARY STATS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-blue-600 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Requirements</p>
              <h3 className="text-3xl font-bold text-slate-800">{loading ? "..." : stats.total}</h3>
            </div>
            <div className="bg-blue-50 p-3 rounded-full text-blue-600 text-xl">📊</div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-amber-500 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 font-medium">Pending Items</p>
              <h3 className="text-3xl font-bold text-slate-800">{loading ? "..." : stats.pending}</h3>
            </div>
            <div className="bg-amber-50 p-3 rounded-full text-amber-600 text-xl">⏳</div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-green-500 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500 font-medium">Completed</p>
              <h3 className="text-3xl font-bold text-slate-800">{loading ? "..." : stats.completed}</h3>
            </div>
            <div className="bg-green-50 p-3 rounded-full text-green-600 text-xl">✅</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white">
                <h2 className="font-bold text-slate-800 text-lg">Compliance & Tax Tracker</h2>
                <div className="flex gap-2 items-center">
                  <button 
                    onClick={() => setIsCompModalOpen(true)}
                    className="bg-slate-800 text-white text-[10px] px-3 py-1.5 rounded-lg font-bold uppercase hover:bg-slate-700 transition"
                  >
                    + Add New
                  </button>
                  <span className="text-[10px] bg-blue-50 px-3 py-1 rounded-full text-blue-600 font-bold uppercase tracking-widest italic animate-pulse">
                    Live DB
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-slate-400 text-[11px] uppercase tracking-widest border-b border-slate-50">
                      <th className="px-6 py-4 font-bold">Requirement</th>
                      <th className="px-6 py-4 font-bold">Deadline</th>
                      <th className="px-6 py-4 font-bold">Status</th>
                      <th className="px-6 py-4 font-bold text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {compliance.length > 0 ? (
                      compliance.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-5">
                            <p className="font-bold text-slate-800">{item.title}</p>
                            <p className="text-[10px] text-slate-400 font-medium uppercase">{item.category} • {item.responsible}</p>
                          </td>
                          <td className="px-6 py-5 text-sm font-mono text-slate-600">
                            {new Date(item.deadline).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-6 py-5">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                              item.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-6 py-5 text-center space-x-2">
                            <button 
                              onClick={async () => { await markAsCompleted(Number(item.id)); fetchData(); }}
                              className="text-lg hover:opacity-70" title="Complete"
                            >✅</button>
                            <button 
                              onClick={async () => { if(confirm("Delete?")) { await deleteComplianceItem(Number(item.id)); fetchData(); } }}
                              className="text-lg hover:opacity-70" title="Delete"
                            >🗑️</button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      !loading && <tr><td colSpan={4} className="p-20 text-center text-slate-400 italic">No tasks found.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Training Column */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-bold text-slate-800 text-lg">Training Schedule</h2>
                <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg uppercase">+ Add New</button>
              </div>
              <div className="space-y-4">
                {trainings.map((t) => (
                  <div key={t.id} className="p-4 rounded-xl border-l-4 border-l-blue-400 bg-blue-50/20">
                    <p className="text-sm font-bold text-slate-800">{t.title}</p>
                    <div className="flex justify-between mt-3 items-end">
                      <span className="text-[11px] font-black text-blue-700 bg-blue-100 px-2 py-0.5 rounded">KES {t.costKES?.toLocaleString()}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase">{new Date(t.startDate).toLocaleDateString('en-KE')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-slate-900 p-8 rounded-2xl shadow-xl text-white relative overflow-hidden group">
               <div className="relative z-10">
                 <h2 className="font-bold mb-6 text-xl">Admin Toolkit</h2>
                 <div className="space-y-3">
                   <button className="w-full py-3.5 px-4 bg-slate-800 hover:bg-blue-600 rounded-xl text-[11px] font-bold text-left transition-all">💡 Log Utility Expense</button>
                   <button className="w-full py-3.5 px-4 bg-slate-800 hover:bg-blue-600 rounded-xl text-[11px] font-bold text-left transition-all">🛠️ Fleet Maintenance</button>
                 </div>
               </div>
               <div className="absolute -right-6 -bottom-6 text-slate-800 text-9xl font-black select-none opacity-10 pointer-events-none">BHL</div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AddTrainingModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={fetchData} />
      <AddComplianceModal isOpen={isCompModalOpen} onClose={() => setIsCompModalOpen(false)} onSuccess={fetchData} />
    </div>
  );
}