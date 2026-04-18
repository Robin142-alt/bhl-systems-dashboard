import Link from "next/link";
import { Briefcase, Building2, Coffee, Settings, Receipt } from "lucide-react";
import { prisma } from "@/lib/prisma";

export default async function OfficeAdminDashboard() {
  const facilityCount = await prisma.asset.count({
    where: { type: { in: ["BUILDING", "VEHICLE", "FURNITURE"] } }
  });

  const recentExpenses = await prisma.operationalExpense.findMany({
    orderBy: { date: 'desc' },
    take: 5
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-4">
          <Briefcase className="text-green-600" size={40} />
          Office Administration
        </h1>
        <p className="text-slate-500 font-medium mt-2">Manage facilities, recurring needs, and general office expenses.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/dashboard/office/facilities" className="block group">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-green-500/30 transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <Building2 size={120} />
            </div>
            <div className="bg-green-100 dark:bg-green-900/30 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-green-600 dark:text-green-400">
              <Settings size={32} />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Facilities & Maintenance</h2>
            <p className="text-slate-500 mb-6 font-medium">Buildings, vehicles, furniture, and maintenance schedules.</p>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-black text-slate-900 dark:text-white">{facilityCount}</span>
              <span className="text-sm font-bold text-slate-400 mb-1 uppercase tracking-wider">Registered Assets</span>
            </div>
          </div>
        </Link>

        <Link href="/dashboard/office/supplies" className="block group">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-amber-500/30 transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <Coffee size={120} />
            </div>
            <div className="bg-amber-100 dark:bg-amber-900/30 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-amber-600 dark:text-amber-400">
              <Receipt size={32} />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Recurring Needs & Supplies</h2>
            <p className="text-slate-500 mb-6 font-medium">Cleaning, toiletries, water, beverages, and electricity.</p>
            <div className="flex items-end gap-2">
              <span className="text-sm font-bold text-slate-400 mb-1 uppercase tracking-wider">Log & Track Expenses</span>
            </div>
          </div>
        </Link>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-8 shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <Receipt className="text-slate-400" /> Recent Office Expenses
          </h3>
          <Link href="/dashboard/expenses" className="text-sm font-bold text-blue-600 hover:underline uppercase tracking-widest">
            View All
          </Link>
        </div>
        
        {recentExpenses.length === 0 ? (
          <p className="text-slate-500 font-medium bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl text-center">No expenses logged recently.</p>
        ) : (
          <div className="space-y-4">
            {recentExpenses.map(exp => (
              <div key={exp.id} className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{exp.description}</p>
                  <span className="text-[10px] font-bold px-2 py-1 bg-slate-200 dark:bg-slate-700 rounded-md uppercase tracking-wider text-slate-600 dark:text-slate-300 mt-1 inline-block">
                    {exp.category}
                  </span>
                </div>
                <div className="text-right">
                  <p className="font-black text-slate-900 dark:text-white">KES {exp.amount.toLocaleString()}</p>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{new Date(exp.date).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
