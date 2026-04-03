"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { LogOut, Download, Plus, Trash2, Search, BarChart3, Wallet, GraduationCap, Printer } from "lucide-react";

interface Training {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  cost: number;
}

// Fixed "Unexpected any" by specifying types
const formatKES = (amount: number | string) => {
  const num = Number(amount) || 0;
  return num.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

export default function TrainingModule() {
  const { data: session } = useSession();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [message, setMessage] = useState("");
  const [formData, setFormData] = useState({
    title: "", 
    startDate: "", 
    endDate: "", 
    cost: 0,
  });

  const ANNUAL_BUDGET = 1000000;

  // 1. Wrap the loader in useCallback to prevent it from changing on every render
  const loadTrainings = useCallback(async () => {
    try {
      const res = await fetch("/api/trainings");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setTrainings(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Fetch error:", err);
    }
  }, []); // Empty dependency array means this function is stable

  // 2. The Effect now simply "synchronizes" with the stable loader
  useEffect(() => {
    let isMounted = true;
    
    if (isMounted) {
      loadTrainings();
    }

    return () => { isMounted = false; }; // Cleanup to prevent state updates on unmounted component
  }, [loadTrainings]);

  const isSpecialMonth = (dateString: string) => {
    if (!dateString) return false;
    const date = new Date(dateString);
    const month = date.getMonth() + 1; 
    return month >= 4 && month <= 6;
  };

  const filteredTrainings = trainings.filter((t) =>
    t.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalSpent = trainings.reduce((sum, t) => sum + (Number(t?.cost) || 0), 0);
  const remainingBudget = ANNUAL_BUDGET - totalSpent; 
  const progressPercent = Math.min((totalSpent / ANNUAL_BUDGET) * 100, 100);

  const downloadCSV = () => {
    let csvContent = "Title,Start Date,End Date,Cost (KES)\n";
    trainings.forEach((t: Training) => {
      csvContent += `"${t.title}",${t.startDate},${t.endDate},${t.cost}\n`;
    });
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "BHL_Training_Report.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const response = await fetch("/api/trainings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      setMessage("✅ Success! Training added.");
      setFormData({ title: "", startDate: "", endDate: "", cost: 0 });
      loadTrainings(); 
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this training?")) return;
    const res = await fetch(`/api/trainings?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setMessage("🗑️ Deleted successfully!");
      loadTrainings();
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto font-sans bg-gray-50 min-h-screen">
      {/* 1. HEADER SECTION */}
      <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 no-print">
        <div>
          <h1 className="text-2xl font-black text-blue-900 uppercase tracking-tighter">BHL Training Portal</h1>
          <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">
            User: {session?.user?.email} ({session?.user?.role})
          </p>
        </div>
        
        <div className="flex gap-3">
          <button onClick={downloadCSV} className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-xl font-bold hover:bg-emerald-100 transition-all text-sm">
            <Download size={18} /> Excel
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-xl font-bold hover:bg-blue-100 transition-all text-sm">
            <Printer size={18} /> Print
          </button>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-xl font-bold hover:bg-red-600 hover:text-white transition-all text-sm">
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </div>

      {/* 2. STATS BOXES SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue-50 rounded-lg text-blue-600"><GraduationCap size={20}/></div>
            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Total Sessions</p>
          </div>
          <h3 className="text-2xl font-black text-slate-800">{trainings.length}</h3>
        </div>

        <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600"><BarChart3 size={20}/></div>
            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Total Spent</p>
          </div>
          <h3 className="text-2xl font-black text-slate-800">KES {formatKES(totalSpent)}</h3>
        </div>

        <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600"><Wallet size={20}/></div>
            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Remaining</p>
          </div>
          <h3 className={`text-2xl font-black ${remainingBudget < 100000 ? 'text-red-600' : 'text-emerald-600'}`}>
            KES {formatKES(remainingBudget)}
          </h3>
        </div>
      </div>

      {/* 3. BUDGET PROGRESS BAR */}
      <div className="mb-8 bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm no-print">
        <div className="flex justify-between items-end mb-3">
          <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Budget Utilization</p>
          <span className={`text-xs font-black px-3 py-1 rounded-full ${progressPercent > 90 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
            {progressPercent.toFixed(1)}% Used
          </span>
        </div>
        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full transition-all duration-1000 ease-out ${progressPercent > 90 ? 'bg-red-500' : progressPercent > 70 ? 'bg-amber-500' : 'bg-blue-600'}`} style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {/* 4. SEARCH BOX */}
      <div className="mb-8 relative group no-print">
        <Search className="absolute left-4 top-4 text-gray-300 group-focus-within:text-blue-500 transition-colors" size={20} />
        <input type="text" placeholder="Search for a training title..." className="w-full pl-12 pr-4 py-4 bg-white border border-gray-100 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
      </div>

      {/* 5. ADD TRAINING FORM (ADMIN ONLY) */}
      {session?.user?.role === "ADMIN" && (
        <section className="mb-10 bg-white p-8 shadow-sm rounded-[2rem] border border-gray-100 no-print">
          <h2 className="text-lg font-black mb-6 flex items-center gap-2">
            <Plus size={20} className="text-blue-600"/> Schedule New Session
          </h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2 space-y-1">
               <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Training Title</label>
               <input type="text" className="w-full border-2 border-gray-50 bg-gray-50 p-3 rounded-2xl focus:border-blue-500 outline-none transition-all" required value={formData.title} onChange={(e) => setFormData({...formData, title: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Start Date</label>
              <input type="date" className="w-full border-2 border-gray-50 bg-gray-50 p-3 rounded-2xl outline-none" required value={formData.startDate} onChange={(e) => setFormData({...formData, startDate: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-gray-400 ml-2">End Date</label>
              <input type="date" className="w-full border-2 border-gray-50 bg-gray-50 p-3 rounded-2xl outline-none" required value={formData.endDate} onChange={(e) => setFormData({...formData, endDate: e.target.value})} />
            </div>
            {isSpecialMonth(formData.startDate) && (
              <div className="md:col-span-2 bg-amber-50 border border-amber-200 p-4 rounded-2xl text-amber-700 text-xs font-bold flex items-center gap-2">
                ⚠️ BUDGET ALERT: April-June training period detected.
              </div>
            )}
            <div className="md:col-span-2 space-y-1">
               <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Cost (KES)</label>
               <input type="number" className="w-full border-2 border-gray-50 bg-gray-50 p-3 rounded-2xl outline-none" required value={formData.cost} onChange={(e) => setFormData({...formData, cost: Number(e.target.value)})} />
            </div>
            <button className="md:col-span-2 bg-slate-900 text-white py-4 rounded-2xl font-black hover:bg-blue-600 transition-all shadow-lg shadow-blue-100 uppercase tracking-widest text-xs">Create Session</button>
          </form>
          {message && <p className="text-center mt-4 font-bold text-blue-600">{message}</p>}
        </section>
      )}

      {/* 6. TRAININGS TABLE */}
      <div className="bg-white shadow-sm rounded-[2rem] overflow-hidden border border-gray-100">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-widest font-black text-gray-400">
              <th className="p-6">Session Details</th>
              <th className="p-6">Financials</th>
              <th className="p-6 no-print">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTrainings.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-10 text-center text-gray-300 font-bold italic">No training sessions found.</td>
              </tr>
            ) : (
              filteredTrainings.map((t: Training) => (
                <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="p-6">
                    <div className="flex items-center gap-4">
                      {session?.user?.role === "ADMIN" && (
                        <button onClick={() => handleDelete(t.id)} className="text-gray-300 hover:text-red-500 transition-colors no-print">
                          <Trash2 size={18} />
                        </button>
                      )}
                      <Link href={`/trainings/${t.id}`} className="font-bold text-slate-800 hover:text-blue-600 transition-colors">
                        {t.title}
                      </Link>
                    </div>
                  </td>
                  <td className="p-6 font-black text-blue-900">KES {formatKES(t?.cost)}</td>
                  <td className="p-6 no-print">
                    <div className="flex flex-col gap-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <input type="text" placeholder="Staff Name..." id={`staff-${t.id}`} className="bg-white border border-gray-200 p-2 text-xs rounded-xl outline-none" />
                      <input type="file" className="text-[10px] font-bold text-gray-400" onChange={async (e) => {
                          const file = e.target.files?.[0];
                          const nameInput = document.getElementById(`staff-${t.id}`) as HTMLInputElement;
                          const staffName = nameInput.value;
                          if (!file || !staffName) { alert("⚠️ Staff Name required!"); return; }
                          const fd = new FormData();
                          fd.append("file", file);
                          const res = await fetch("/api/upload", { method: "POST", body: fd });
                          const uploadData = await res.json();
                          if (res.ok) {
                            await fetch("/api/attendance", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                trainingId: t.id,
                                staffName: staffName,
                                staffEmail: `${staffName.toLowerCase().replace(" ", "")}@bhl.com`,
                                attended: true,
                                certificateUrl: uploadData.fileUrl
                              }),
                            });
                            alert(`✅ Saved for ${staffName}`);
                            nameInput.value = ""; 
                          }
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .p-8 { padding: 0 !important; }
          .bg-white { border: none !important; shadow: none !important; }
          table { width: 100% !important; border: 1px solid #eee !important; }
          th { background-color: #f9fafb !important; color: #000 !important; }
        }
      `}</style>
    </div>
  );
}