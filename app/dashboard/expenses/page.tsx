import { prisma } from "@/lib/prisma";
import { Calendar, Building2 } from "lucide-react";
import ExpenseClient from "@/components/ExpenseClient";

export default async function ExpensesPage() {
  const [expenses, vendors] = await Promise.all([
    prisma.operationalExpense.findMany({
      include: { vendor: true, createdBy: true },
      orderBy: { date: 'desc' }
    }),
    prisma.vendor.findMany({
      orderBy: { name: 'asc' }
    })
  ]);

  const totalSpent = expenses.reduce((acc, curr) => acc + curr.amount, 0);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Operational Expenses</h1>
          <p className="text-slate-500 text-sm">Track BHL office spending and utility bills</p>
        </div>
        <ExpenseClient vendors={vendors} />
      </div>

      <div className="bg-blue-600 rounded-2xl p-6 mb-8 text-white shadow-lg shadow-blue-200">
        <p className="text-blue-100 text-sm font-medium uppercase tracking-wider">Total Operational Spend</p>
        <h2 className="text-4xl font-black mt-1">KES {totalSpent.toLocaleString()}</h2>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Description</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Vendor</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Category</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Amount</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">Logged By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {expenses.map((exp) => (
              <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <p className="font-semibold text-slate-800">{exp.description}</p>
                  <div className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                    <Calendar size={12} />
                    {new Date(exp.date).toLocaleDateString()}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <Building2 size={14} className="text-slate-400" />
                    {exp.vendor?.name || "N/A"}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded uppercase">
                    {exp.category}
                  </span>
                </td>
                <td className="px-6 py-4 font-bold text-slate-900">
                  KES {exp.amount.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-sm text-slate-500">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">
                      {exp.createdBy.name?.[0] || "?"}
                    </div>
                    {exp.createdBy.name || "Unknown"}
                  </div>
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                  No expenses logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}