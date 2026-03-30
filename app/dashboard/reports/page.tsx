"use client";

import { Download, TrendingUp, Wallet, Wrench, Package } from "lucide-react";

export default function ReportsPage({ 
  totalOpEx = 50000, 
  totalMaint = 12000, 
  totalInvValue = 250000 
}) {
  // 1. Data arrays ensure our icon imports are actually used
  const stats = [
    { name: 'Total OpEx', value: totalOpEx, icon: Wallet, color: 'text-blue-600', bg: 'bg-blue-50' },
    { name: 'Maintenance', value: totalMaint, icon: Wrench, color: 'text-amber-600', bg: 'bg-amber-50' },
    { name: 'Stock Value', value: totalInvValue, icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  const totalSpend = totalOpEx + totalMaint;
  const opPercent = totalSpend > 0 ? Math.round((totalOpEx / totalSpend) * 100) : 0;
  const maintPercent = totalSpend > 0 ? 100 - opPercent : 0;

  // 2. Safe Print Handler: Only executes when the user clicks it in the browser
  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Financial Intelligence</h1>
          <p className="text-slate-500 text-sm">BHL Performance Overview</p>
        </div>
        
        <button 
          onClick={handlePrint} 
          className="flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-lg"
        >
          <Download size={18} /> Export PDF Report
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm print:border-slate-300">
            <div className={`${stat.bg} ${stat.color} w-12 h-12 rounded-2xl flex items-center justify-center mb-4 print:hidden`}>
              <stat.icon size={24} />
            </div>
            <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{stat.name}</p>
            <h2 className="text-2xl font-black text-slate-900 mt-1">KES {stat.value.toLocaleString()}</h2>
          </div>
        ))}
      </div>

      {/* Analytics Section */}
      <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm print:border-slate-300">
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-slate-800">
          <TrendingUp size={20} className="text-blue-600 print:hidden" />
          Spend Distribution (Operations vs Maintenance)
        </h3>
        
        <div className="w-full bg-slate-100 h-6 rounded-full overflow-hidden flex border border-slate-50">
          <div className="bg-blue-600 h-full transition-all" style={{ width: `${opPercent}%` }} />
          <div className="bg-amber-500 h-full transition-all" style={{ width: `${maintPercent}%` }} />
        </div>
        
        <div className="flex justify-between mt-4 text-xs font-bold uppercase">
          <span className="text-blue-600">Operations: {opPercent}%</span>
          <span className="text-amber-600">Maintenance: {maintPercent}%</span>
        </div>
      </div>
    </div>
  );
}