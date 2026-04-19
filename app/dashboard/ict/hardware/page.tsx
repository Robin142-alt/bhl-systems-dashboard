import { Server, Plus, Settings2, Trash2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { createHardwareAsset } from "@/app/actions";

export const dynamic = 'force-dynamic';

export default async function HardwareAssetsPage() {
  const assets = await prisma.asset.findMany({
    where: { type: "HARDWARE" },
    include: { maintenance: true },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-4">
          <Server className="text-blue-600" size={40} />
          Hardware Assets
        </h1>
        <p className="text-slate-500 font-medium mt-2">Manage servers, printers, CCTV and track maintenance.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Registered Hardware</h2>
              <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 py-1 px-3 rounded-full text-xs font-bold uppercase tracking-widest">
                {assets.length} Total
              </span>
            </div>
            
            {assets.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-medium">
                No hardware registered yet. Add one from the right panel.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {assets.map((asset) => (
                  <div key={asset.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div>
                      <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                        {asset.name}
                        <span className="text-[10px] font-bold px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-md uppercase tracking-wider">{asset.status}</span>
                      </h3>
                      <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-wider">SN: {asset.serialNumber || 'N/A'}</p>
                    </div>
                    
                    <div className="flex items-center gap-4">
                       <div className="text-right">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Maintenance Logs</p>
                        <p className="text-sm font-black text-slate-900 dark:text-white">{asset.maintenance.length} Records</p>
                      </div>

                      <button className="p-3 text-slate-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 rounded-xl transition-colors">
                        <Settings2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm p-6 sticky top-6">
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-6">Register Hardware</h2>
            <form action={async (formData) => { "use server"; await createHardwareAsset(formData); }} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Hardware Name / Model</label>
                <input 
                  type="text" 
                  name="name" 
                  required 
                  placeholder="e.g., Dell PowerEdge Server"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Serial Number</label>
                <input 
                  type="text" 
                  name="serialNumber" 
                  placeholder="e.g., S/N-12345"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Purchase Date</label>
                <input 
                  type="date" 
                  name="purchaseDate" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <button type="submit" className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-black py-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all uppercase tracking-widest flex items-center justify-center gap-2">
                <Plus size={20} /> Register Asset
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
