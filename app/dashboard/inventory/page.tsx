import { prisma } from "@/lib/prisma";
import { Package, AlertCircle, ArrowUpRight, ArrowDownLeft, History, User as UserIcon } from "lucide-react";
import InventoryClient from "@/components/InventoryClient";

export default async function InventoryPage() {
  // Fetch Items and Movements in parallel for speed
  const [items, movements] = await Promise.all([
    prisma.inventoryItem.findMany({ orderBy: { name: 'asc' } }),
    prisma.stockMovement.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: { 
        item: { select: { name: true, category: true } },
        performedBy: { select: { name: true } }
      }
    })
  ]);

  const lowStockItems = items.filter(item => item.quantity <= item.minQuantity);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory & Logistics</h1>
          <p className="text-slate-500 text-sm">Real-time stock tracking for BHL HQ</p>
        </div>
        <InventoryClient items={items} />
      </div>

      {lowStockItems.length > 0 && (
        <div className="mb-8 flex items-center gap-4 bg-red-50 border border-red-100 p-4 rounded-2xl text-red-700">
          <AlertCircle className="shrink-0" size={20} />
          <div className="text-sm">
            <span className="font-bold">Stock Alert:</span> {lowStockItems.length} items need restocking soon.
          </div>
        </div>
      )}

      {/* STOCK CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
        {items.map((item) => (
          <div key={item.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="flex justify-between items-start mb-3">
              <div className="bg-slate-100 p-2 rounded-lg text-slate-600"><Package size={18} /></div>
              <span className={`text-[10px] font-black px-2 py-1 rounded-full uppercase ${item.quantity > item.minQuantity ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {item.quantity} units
              </span>
            </div>
            <h3 className="font-bold text-slate-800 truncate">{item.name}</h3>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-tighter">{item.category}</p>
          </div>
        ))}
      </div>

      {/* MOVEMENT HISTORY TABLE */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-6 border-b border-slate-100 flex items-center gap-2">
          <History size={20} className="text-slate-400" />
          <h2 className="text-lg font-bold text-slate-800">Recent Stock Movements</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              <tr>
                <th className="px-6 py-4">Event</th>
                <th className="px-6 py-4">Item</th>
                <th className="px-6 py-4">Qty</th>
                <th className="px-6 py-4">Reason</th>
                <th className="px-6 py-4">User</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    {m.type === "IN" ? (
                      <span className="flex items-center gap-1 text-green-600 font-bold text-xs">
                        <ArrowUpRight size={14} /> Stock In
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-blue-600 font-bold text-xs">
                        <ArrowDownLeft size={14} /> Stock Out
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-slate-700">{m.item.name}</td>
                  <td className="px-6 py-4 text-sm font-bold text-slate-900">{m.quantity}</td>
                  <td className="px-6 py-4 text-xs text-slate-500 italic">{m.reason || "N/A"}</td>
                  <td className="px-6 py-4 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <UserIcon size={12} /> {m.performedBy.name}
                    </div>
                  </td>
                </tr>
              ))}
              {movements.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">No movements recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}