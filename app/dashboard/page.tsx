"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import axios from "axios";
import AddTrainingModal from "@/components/AddTrainingModal";
import AddComplianceModal from "@/components/AddComplianceModal";
import { markAsCompleted, deleteComplianceItem } from "@/app/actions";

// 1. DATA INTERFACES
interface ComplianceItem {
  id: number;
  title: string;
  deadline: string;
  status: string;
  responsible: string;
  category: string;
}

interface Training {
  id: number;
  title: string;
  startDate: string;
  location: string;
  costKES: number;
  description?: string;
}

export default function Dashboard() {
  const [compliance, setCompliance] = useState<ComplianceItem[]>([]);
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCompModalOpen, setIsCompModalOpen] = useState(false);

  // 2. BHL BUSINESS LOGIC & STATS
  const stats = useMemo(() => {
    return {
      total: compliance.length,
      pending: compliance.filter(item => item.status !== "Completed").length,
      completed: compliance.filter(item => item.status === "Completed").length,
      trainingCount: trainings.length,
      totalTrainingSpend: trainings.reduce((sum, t) => sum + (Number(t.costKES) || 0), 0)
    };
  }, [compliance, trainings]);

  // 3. FETCH DATA (Using allSettled to ensure one failure doesn't crash the whole dashboard)
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [compRes, trainRes] = await Promise.allSettled([
        axios.get("/api/compliance"),
        axios.get("/api/trainings")
      ]);

      if (compRes.status === 'fulfilled') setCompliance(compRes.value.data);
      if (trainRes.status === 'fulfilled') setTrainings(trainRes.value.data);

    } catch (err) {
      console.error("Dashboard Sync Error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 4. ACTION HANDLERS
  const handleComplete = async (id: number) => {
    try {
      await markAsCompleted(id);
      await fetchData(); 
    } catch (err) {
      console.error("Update failed:", err);
      alert("Failed to update status.");
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm("Are you sure you want to delete this compliance item?")) {
      try {
        await deleteComplianceItem(id);
        await fetchData();
      } catch (err) {
        console.error("Delete Action Failed:", err);
        alert("Failed to delete item.");
      }
    }
  };

  return (
    <div className="p-8 bg-slate-50 min-h-screen relative">
      <div className="max-w-7xl mx-auto">
        
        {/* HEADER SECTION */}
        <header className="mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-extrabold text-slate-900 mb-2 tracking-tight uppercase italic">BHL Business Hub</h1>
            <p className="text-slate-500 font-medium">Kenya Regulatory & Operations Dashboard • Ruiru HQ</p>
          </div>
          <div className="text-right">
             <span className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">System Status</span>
             <span className="flex items-center gap-2 text-emerald-500 text-xs font-bold">
               <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping"></span> Live Connection
             </span>
          </div>
        </header>

        {/* SUMMARY STATS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-blue-600 transition-transform hover:scale-105">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Requirements</p>
            <h3 className="text-3xl font-bold text-slate-800">{loading ? "..." : stats.total}</h3>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-amber-500 transition-transform hover:scale-105">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Pending</p>
            <h3 className="text-3xl font-bold text-slate-800">{loading ? "..." : stats.pending}</h3>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-green-500 transition-transform hover:scale-105">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Completed</p>
            <h3 className="text-3xl font-bold text-slate-800">{loading ? "..." : stats.completed}</h3>
          </div>
          <div className="bg-slate-900 p-6 rounded-2xl shadow-sm border-l-4 border-blue-400 transition-transform hover:scale-105">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Training Spend</p>
            <h3 className="text-2xl font-bold text-white">KES {stats.totalTrainingSpend.toLocaleString()}</h3>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN: COMPLIANCE TABLE */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h2 className="font-black text-slate-800 text-lg uppercase tracking-tight">Compliance & Tax Tracker</h2>
                <button 
                  onClick={() => setIsCompModalOpen(true)}
                  className="bg-slate-900 text-white text-[10px] px-4 py-2 rounded-xl font-black uppercase hover:bg-blue-600 transition-all shadow-lg shadow-blue-100"
                >
                  + Add Requirement
                </button>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-[0.15em] font-black">
                      <th className="px-6 py-4">Requirement</th>
                      <th className="px-6 py-4">Deadline</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-center">Manage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {compliance.length > 0 ? (
                      compliance.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-5">
                            <p className="font-bold text-slate-800">{item.title}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">
                              {item.category} • {item.responsible}
                            </p>
                          </td>
                          <td className="px-6 py-5 text-xs font-black text-slate-600">
                            {new Date(item.deadline).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-6 py-5">
                            <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                              item.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex justify-center gap-2">
                              <button onClick={() => handleComplete(item.id)} className="p-2 hover:bg-green-50 rounded-lg transition-colors" title="Mark Done">✅</button>
                              <button onClick={() => handleDelete(item.id)} className="p-2 hover:bg-red-50 rounded-lg transition-colors" title="Remove">🗑️</button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      !loading && <tr><td colSpan={4} className="p-20 text-center text-slate-300 font-bold italic">No active compliance tasks.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: TRAINING & ADMIN TOOLS */}
          <div className="space-y-6">
            
            {/* TRAINING CARD */}
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-6">
                <h2 className="font-black text-slate-800 text-lg uppercase tracking-tight">Training</h2>
                <button onClick={() => setIsModalOpen(true)} className="bg-blue-600 text-white text-[10px] font-black px-4 py-2 rounded-xl uppercase shadow-lg shadow-blue-100 hover:bg-slate-900 transition-all">
                  + Schedule
                </button>
              </div>
              <div className="space-y-4">
                {trainings.length > 0 ? trainings.map((t) => (
                  <div key={t.id} className="p-5 rounded-2xl border border-slate-100 bg-white hover:border-blue-200 transition-all shadow-sm">
                    <p className="text-sm font-black text-slate-800 mb-1">{t.title}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">📍 {t.location}</p>
                    <div className="flex justify-between items-end">
                      <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                        KES {Number(t?.costKES || 0).toLocaleString()}
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold">
                        {new Date(t.startDate).toLocaleDateString('en-KE')}
                      </span>
                    </div>
                  </div>
                )) : (
                  !loading && <p className="text-center py-6 text-slate-300 font-bold text-xs italic">No upcoming sessions.</p>
                )}
              </div>
            </div>
            
            {/* ADMIN TOOLKIT SECTION */}
            <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden group">
               <div className="relative z-10">
                 <h2 className="font-black mb-6 text-xl uppercase tracking-tighter italic underline decoration-blue-500 decoration-4">Admin Toolkit</h2>
                 <div className="space-y-3">
                   <button className="w-full py-4 px-5 bg-slate-800/50 hover:bg-blue-600 rounded-2xl text-[11px] font-black text-left transition-all uppercase tracking-widest border border-slate-700">
                     💡 Log Utility Expense
                   </button>
                   <button className="w-full py-4 px-5 bg-slate-800/50 hover:bg-blue-600 rounded-2xl text-[11px] font-black text-left transition-all uppercase tracking-widest border border-slate-700">
                     🛠️ Fleet Maintenance
                   </button>
                 </div>
               </div>
               <div className="absolute -right-8 -bottom-8 text-white text-[12rem] font-black select-none opacity-5 pointer-events-none tracking-tighter">BHL</div>
            </div>
            
          </div>
        </div>
      </div>

      {/* MODALS */}
      <AddTrainingModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSuccess={fetchData} />
      <AddComplianceModal isOpen={isCompModalOpen} onClose={() => setIsCompModalOpen(false)} onSuccess={fetchData} />
    </div>
  );
}