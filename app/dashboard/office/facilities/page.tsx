import { Building2, Plus, Settings2, Wrench } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { createOfficeAsset, addMaintenanceLog } from "@/app/actions";

export default async function FacilitiesAssetsPage() {
  const assets = await prisma.asset.findMany({
    where: { type: { in: ["BUILDING", "VEHICLE", "FURNITURE"] } },
    include: { maintenance: true },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-4">
          <Building2 className="text-green-600" size={40} />
          Facilities & Maintenance
        </h1>
        <p className="text-slate-500 font-medium mt-2">Manage buildings, company vehicles, office furniture, and track maintenance.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Registered Facilities</h2>
              <span className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 py-1 px-3 rounded-full text-xs font-bold uppercase tracking-widest">
                {assets.length} Total
              </span>
            </div>
            
            {assets.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-medium">
                No facilities registered yet. Add one from the right panel.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {assets.map((asset) => (
                  <div key={asset.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div>
                      <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                        {asset.name}
                        <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md uppercase tracking-wider text-slate-500">{asset.type}</span>
                        <span className="text-[10px] font-bold px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-md uppercase tracking-wider">{asset.status}</span>
                      </h3>
                      <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-wider">{asset.serialNumber || 'N/A'}</p>
                    </div>
                    
                    <div className="flex items-center gap-4">
                       <div className="text-right">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center justify-end gap-1"><Wrench size={12}/> Logs</p>
                        <p className="text-sm font-black text-slate-900 dark:text-white">{asset.maintenance.length}</p>
                      </div>

                      <button className="p-3 text-slate-400 hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/20 rounded-xl transition-colors">
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
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-6">Register Facility</h2>
            <form action={async (formData) => { "use server"; await createOfficeAsset(formData); }} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Name / Description</label>
                <input 
                  type="text" 
                  name="name" 
                  required 
                  placeholder="e.g., HQ Building, Toyota Hilux"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Category</label>
                <select 
                  name="type" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:outline-none"
                >
                  <option value="BUILDING">Building / Premises</option>
                  <option value="VEHICLE">Company Vehicle</option>
                  <option value="FURNITURE">Office Furniture</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Identifier (Optional)</label>
                <input 
                  type="text" 
                  name="serialNumber" 
                  placeholder="e.g., License Plate, Block No."
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Acquisition Date</label>
                <input 
                  type="date" 
                  name="purchaseDate" 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:outline-none"
                />
              </div>

              <button type="submit" className="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-black py-4 rounded-xl shadow-lg shadow-green-500/30 transition-all uppercase tracking-widest flex items-center justify-center gap-2">
                <Plus size={20} /> Register Facility
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
