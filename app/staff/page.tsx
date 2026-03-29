import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from 'pg';
import { Mail, Briefcase, Plus } from "lucide-react";
import { createEmployee } from "../actions"; // <--- ADD THIS IMPORT

// Setup the connection
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

export default async function StaffPage() {
  const employees = await prisma.employee.findMany({
    orderBy: { fullName: 'asc' }
  });

  return (
    <div className="space-y-10 animate-in fade-in duration-700 p-8">
      
      {/* --- HEADER SECTION --- */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Staff Directory</h1>
          <p className="text-slate-500 font-medium">Manage your team members and roles</p>
        </div>
      </div>

      {/* --- NEW: QUICK ADD STAFF FORM (The Dark Box) --- */}
      <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl border border-slate-800">
        <h3 className="text-white font-black mb-6 flex items-center gap-2 text-sm uppercase tracking-widest">
          <Plus className="text-blue-400" size={18} /> Register New Staff
        </h3>
        <form action={createEmployee} className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <input name="fullName" placeholder="Full Name" required className="bg-slate-800 border-none rounded-2xl p-4 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 transition-all text-sm" />
          <input name="email" type="email" placeholder="Email Address" required className="bg-slate-800 border-none rounded-2xl p-4 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 transition-all text-sm" />
          <input name="department" placeholder="Department" required className="bg-slate-800 border-none rounded-2xl p-4 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 transition-all text-sm" />
          <input name="role" placeholder="Job Title" required className="bg-slate-800 border-none rounded-2xl p-4 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 transition-all text-sm" />
          <button type="submit" className="bg-blue-600 hover:bg-blue-500 text-white font-black px-6 rounded-2xl transition-all active:scale-95 shadow-lg shadow-blue-500/20 text-sm py-4">
            Save Staff
          </button>
        </form>
      </div>

      {/* --- STAFF TABLE --- */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-50">
                <th className="px-10 py-6">Name & Email</th>
                <th className="px-10 py-6">Department</th>
                <th className="px-10 py-6">Role</th>
                <th className="px-10 py-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-10 py-20 text-center text-slate-400 font-medium">
                    No staff members found. Add one above!
                  </td>
                </tr>
              ) : (
                employees.map((staff) => (
                  <tr key={staff.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-10 py-6">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold group-hover:bg-blue-600 group-hover:text-white transition-colors">
                          {staff.fullName.charAt(0)}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800 text-sm">{staff.fullName}</span>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1"><Mail size={10}/> {staff.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-6">
                      <span className="text-sm text-slate-600 font-bold flex items-center gap-2">
                        <Briefcase size={14} className="text-slate-300" /> {staff.department}
                      </span>
                    </td>
                    <td className="px-10 py-6">
                      <span className="inline-block px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter border bg-slate-50 text-slate-600 border-slate-100">
                        {staff.role}
                      </span>
                    </td>
                    <td className="px-10 py-6 text-right">
                      <button className="text-slate-300 hover:text-red-500 transition-colors font-bold text-xs">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}