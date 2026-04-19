import { Globe, Plus, Trash2, CalendarDays } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { createSoftwareSubscription, deleteSoftwareSubscription } from "@/app/actions";

export const dynamic = 'force-dynamic';

export default async function SoftwareSubscriptionsPage() {
  const subscriptions = await prisma.softwareSubscription.findMany({
    orderBy: { nextBillingDate: 'asc' }
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-4">
          <Globe className="text-purple-600" size={40} />
          Software Subscriptions
        </h1>
        <p className="text-slate-500 font-medium mt-2">Manage Internet, Microsoft 365, AWS, Starlink, etc.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Active Subscriptions</h2>
              <span className="bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 py-1 px-3 rounded-full text-xs font-bold uppercase tracking-widest">
                {subscriptions.length} Total
              </span>
            </div>
            
            {subscriptions.length === 0 ? (
              <div className="p-12 text-center text-slate-500 font-medium">
                No active subscriptions found. Add one from the right panel.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <div>
                      <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                        {sub.name}
                        <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded-md uppercase tracking-wider text-slate-500">{sub.status}</span>
                      </h3>
                      <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-wider">{sub.provider || 'No Provider specified'}</p>
                    </div>
                    
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-lg font-black text-slate-900 dark:text-white">KES {sub.cost.toLocaleString()}</p>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{sub.billingCycle}</p>
                      </div>
                      
                      <div className="text-right bg-orange-50 dark:bg-orange-900/20 px-4 py-2 rounded-xl border border-orange-100 dark:border-orange-800/50">
                        <p className="text-xs font-bold text-orange-500 uppercase tracking-widest flex items-center gap-1 justify-end">
                          <CalendarDays size={12} /> Next Billing
                        </p>
                        <p className="text-sm font-black text-orange-600 dark:text-orange-400">
                          {new Date(sub.nextBillingDate).toLocaleDateString()}
                        </p>
                      </div>

                      <form action={async () => {
                        "use server";
                        await deleteSoftwareSubscription(sub.id);
                      }}>
                        <button type="submit" className="p-3 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 rounded-xl transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm p-6 sticky top-6">
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-6">Add Subscription</h2>
            <form action={async (formData) => { "use server"; await createSoftwareSubscription(formData); }} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Software/Service Name</label>
                <input 
                  type="text" 
                  name="name" 
                  required 
                  placeholder="e.g., Microsoft 365, Starlink"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Provider (Optional)</label>
                <input 
                  type="text" 
                  name="provider" 
                  placeholder="e.g., Microsoft, AWS"
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Billing Cycle</label>
                  <select 
                    name="billingCycle" 
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="ANNUALLY">Annually</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Cost (KES)</label>
                  <input 
                    type="number" 
                    name="cost" 
                    required 
                    placeholder="0"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Next Billing Date</label>
                <input 
                  type="date" 
                  name="nextBillingDate" 
                  required 
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>

              <button type="submit" className="w-full mt-4 bg-purple-600 hover:bg-purple-700 text-white font-black py-4 rounded-xl shadow-lg shadow-purple-500/30 transition-all uppercase tracking-widest flex items-center justify-center gap-2">
                <Plus size={20} /> Add Subscription
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
