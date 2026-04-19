import { prisma } from "@/lib/prisma";
import { getMonthlyBudgetStats } from "@/app/actions";

export const dynamic = 'force-dynamic';
import RecordAchievementForm from "@/components/RecordAchievementForm";
import PrintButton from "@/components/PrintButton";
import { 
  ClipboardCheck, 
  History, 
  TrendingUp, 
  Wallet, 
  Wrench, 
  Package, 
  Info,
  Download // <--- RESTORED
} from "lucide-react";
import Link from "next/link";

export default async function RecordsPage() {
  // 1. DUAL FETCH: Get Financial Stats AND Training Modules
  const [statsResult, trainings] = await Promise.all([
    getMonthlyBudgetStats(),
    prisma.training.findMany({
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    })
  ]);

  // 2. DATA PREP: Handle fallback for financial data
  const finData = statsResult.success && statsResult.data ? statsResult.data : {
    operational: 0,
    maintenance: 0,
    training: 0,
    month: "Current"
  };

  // 3. YOUR EXACT STATS ARRAY
  const dashboardStats = [
    { name: 'Total OpEx', value: finData.operational, icon: Wallet, color: 'text-blue-600', bg: 'bg-blue-50' },
    { name: 'Maintenance', value: finData.maintenance, icon: Wrench, color: 'text-amber-600', bg: 'bg-amber-50' },
    { name: 'Staff Training', value: finData.training, icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  const totalSpend = finData.operational + finData.maintenance;
  const opPercent = totalSpend > 0 ? Math.round((finData.operational / totalSpend) * 100) : 0;
  const maintPercent = totalSpend > 0 ? 100 - opPercent : 0;

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-10 animate-in fade-in duration-700">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-100 pb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardCheck className="text-blue-600" size={28} />
            <h1 className="text-3xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">
              Strategic Command
            </h1>
          </div>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">
            BHL Oversight • {finData.month} 2026 Financials
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* We keep the PrintButton separate, but you could also add a manual download button here */}
          <PrintButton />
          <Link 
            href="/dashboard/history" 
            className="flex items-center gap-2 text-slate-500 hover:text-blue-600 font-black text-[10px] uppercase tracking-widest transition-colors bg-slate-100 dark:bg-slate-800 px-5 py-3 rounded-2xl"
          >
            <History size={14} /> Audit History
          </Link>
        </div>
      </div>

      {/* FINANCIAL INTELLIGENCE ROW (The 3-Card Grid) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {dashboardStats.map((stat) => (
          <div key={stat.name} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-[2rem] shadow-sm">
            <div className={`${stat.bg} ${stat.color} w-10 h-10 rounded-xl flex items-center justify-center mb-4`}>
              <stat.icon size={20} />
            </div>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{stat.name}</p>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
              KES {stat.value.toLocaleString()}
            </h2>
          </div>
        ))}
      </div>

      {/* PROGRESS BAR SECTION */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2.5rem] p-8 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-sm font-black flex items-center gap-2 text-slate-800 dark:text-white uppercase tracking-widest">
            <TrendingUp size={18} className="text-blue-600" />
            Budget Allocation
          </h3>
          <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Live Analysis</span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-4 rounded-full overflow-hidden flex">
          <div className="bg-blue-600 h-full transition-all duration-1000" style={{ width: `${opPercent}%` }} />
          <div className="bg-amber-500 h-full transition-all duration-1000" style={{ width: `${maintPercent}%` }} />
        </div>
        <div className="flex justify-between mt-4 text-[10px] font-black uppercase tracking-widest">
          <span className="text-blue-600">Operations ({opPercent}%)</span>
          <span className="text-amber-600">Maintenance ({maintPercent}%)</span>
        </div>
      </div>

      {/* FORM SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 pt-4">
        <div className="lg:col-span-7">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Log New Achievement</h2>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Authorize Staff Certification</p>
            </div>
          </div>
          <RecordAchievementForm trainings={trainings} />
        </div>

        {/* GUIDANCE SECTION */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-8 rounded-[2.5rem]">
            <div className="flex items-center gap-2 text-blue-600 mb-6">
              <Info size={20} />
              <h3 className="font-black uppercase text-xs tracking-widest text-blue-700">Quick Guide</h3>
            </div>
            <ul className="space-y-5">
              {[
                { t: "Identity Check", d: "Verify Staff Email in Directory" },
                { t: "Module Selection", d: "Select Training (Auto-Calculates Cost)" },
                { t: "Evidence Archiving", d: "Host Certificate PDF and paste URL" }
              ].map((item, i) => (
                <li key={i} className="flex gap-4">
                  <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">{i+1}</span>
                  <div>
                    <p className="text-[10px] font-black uppercase text-blue-600 tracking-tight leading-none mb-1">{item.t}</p>
                    <p className="text-sm text-slate-600 dark:text-slate-300 font-medium leading-tight">{item.d}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          
          {/* SYSTEM NOTES */}
          <div className="p-8 border border-slate-100 dark:border-slate-800 rounded-[2.5rem] bg-white dark:bg-slate-900">
             <div className="flex items-center gap-2 mb-3">
               <Download size={14} className="text-slate-400" />
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Persistence</p>
             </div>
             <p className="text-xs text-slate-500 italic leading-relaxed">
               All authorized achievements generate a unique BHL Certificate ID and are instantly reflected in the Financial Intelligence reports.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}