import { Coffee, Plus, Calendar } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { logOfficeSupplyExpense } from "@/app/actions";

export default async function OfficeSuppliesPage() {
  const suppliesCategories = ["Cleaning", "Toiletries", "Water & Beverages", "Electricity / Utilities", "Stationery", "Other Office Needs"];

  const expenses = await prisma.operationalExpense.findMany({
    where: { category: { in: suppliesCategories } },
    orderBy: { date: 'desc' }
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-4">
          <Coffee className="text-amber-600" size={40} />
          Recurring Needs & Supplies
        </h1>
        <p className="text-slate-500 font-medium mt-2">Log and track expenses for cleaning, water, electricity, and office staples.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Recent Supply Expenses</h2>
            </div>
            
            {expenses.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-medium">
                No supply expenses logged yet. Add one from the right panel.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {expenses.map((exp) => (
                  <div key={exp.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div>
                      <h3 className="text-lg font-black text-slate-900 dark:text-white">{exp.description}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold px-2 py-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-md uppercase tracking-wider">{exp.category}</span>
                        <span className="text-xs font-bold text-slate-400 flex items-center gap-1 uppercase tracking-widest"><Calendar size={12}/> {new Date(exp.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-2xl font-black text-slate-900 dark:text-white">KES {exp.amount.toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm p-6 sticky top-6">
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-6">Log Supply Expense</h2>
            <form action={async (formData) => { "use server"; await logOfficeSupplyExpense(formData); }} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Description</label>
                <input 
                  type="text" 
                  name="description" 
                  required 
                  placeholder="e.g., Monthly KPLC Tokens, 5x Drinking Water"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Category</label>
                <select 
                  name="category" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  {suppliesCategories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Amount (KES)</label>
                <input 
                  type="number" 
                  name="amount" 
                  required
                  placeholder="0"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Date</label>
                <input 
                  type="date" 
                  name="date" 
                  defaultValue={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <button type="submit" className="w-full mt-4 bg-amber-500 hover:bg-amber-600 text-white font-black py-4 rounded-xl shadow-lg shadow-amber-500/30 transition-all uppercase tracking-widest flex items-center justify-center gap-2">
                <Plus size={20} /> Log Expense
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
