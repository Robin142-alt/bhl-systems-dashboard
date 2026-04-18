import Link from "next/link";
import { Cpu, Server, Globe, MonitorSmartphone, Database, LayoutDashboard } from "lucide-react";
import { prisma } from "@/lib/prisma";

export default async function ICTDashboardPage() {
  const hardwareCount = await prisma.asset.count({ where: { type: "HARDWARE" } });
  const softwareCount = await prisma.softwareSubscription.count();

  // Basic upcoming renewals
  const upcomingRenewals = await prisma.softwareSubscription.findMany({
    orderBy: { nextBillingDate: 'asc' },
    take: 3
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-4">
          <Cpu className="text-blue-600" size={40} />
          ICT & Systems Hub
        </h1>
        <p className="text-slate-500 font-medium mt-2">Manage hardware assets, maintenance, and software subscriptions.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/dashboard/ict/hardware" className="block group">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-blue-500/30 transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <Server size={120} />
            </div>
            <div className="bg-blue-100 dark:bg-blue-900/30 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-blue-600 dark:text-blue-400">
              <MonitorSmartphone size={32} />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Hardware Assets</h2>
            <p className="text-slate-500 mb-6 font-medium">Servers, printers, CCTV, and maintenance logs.</p>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-black text-slate-900 dark:text-white">{hardwareCount}</span>
              <span className="text-sm font-bold text-slate-400 mb-1 uppercase tracking-wider">Registered Items</span>
            </div>
          </div>
        </Link>

        <Link href="/dashboard/ict/software" className="block group">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-xl hover:border-purple-500/30 transition-all duration-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
              <Globe size={120} />
            </div>
            <div className="bg-purple-100 dark:bg-purple-900/30 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-purple-600 dark:text-purple-400">
              <Database size={32} />
            </div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Software Subscriptions</h2>
            <p className="text-slate-500 mb-6 font-medium">Internet, Microsoft 365, AWS, and billing cycles.</p>
            <div className="flex items-end gap-2">
              <span className="text-4xl font-black text-slate-900 dark:text-white">{softwareCount}</span>
              <span className="text-sm font-bold text-slate-400 mb-1 uppercase tracking-wider">Active Subscriptions</span>
            </div>
          </div>
        </Link>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-8 shadow-sm">
        <h3 className="text-xl font-black text-slate-900 dark:text-white mb-6 flex items-center gap-3">
          <Globe className="text-slate-400" /> Upcoming Renewals
        </h3>
        {upcomingRenewals.length === 0 ? (
          <p className="text-slate-500 font-medium bg-slate-50 dark:bg-slate-800/50 p-6 rounded-2xl text-center">No upcoming renewals found.</p>
        ) : (
          <div className="space-y-4">
            {upcomingRenewals.map(sub => (
              <div key={sub.id} className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{sub.name}</p>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{sub.provider || 'N/A'}</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-slate-900 dark:text-white">KES {sub.cost.toLocaleString()}</p>
                  <p className="text-xs font-bold text-orange-500 uppercase tracking-widest">Due: {new Date(sub.nextBillingDate).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
