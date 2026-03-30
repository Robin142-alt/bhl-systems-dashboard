import { prisma } from "@/lib/prisma";
import { Phone, Tag, User } from "lucide-react";
import VendorClient from "@/components/VendorClient"; // 👈 Import our new wrapper

export default async function VendorsPage() {
  const vendors = await prisma.vendor.findMany({
    orderBy: { name: 'asc' },
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Vendor Management</h1>
          <p className="text-slate-500 text-sm">Manage BHL service providers and suppliers</p>
        </div>
        
        {/* 👈 Use the Client Wrapper instead of a raw button */}
        <VendorClient /> 
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {vendors.map((vendor) => (
          <div key={vendor.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-blue-50 p-3 rounded-lg text-blue-600">
                <Tag size={20} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-600 px-2 py-1 rounded">
                {vendor.category}
              </span>
            </div>
            
            <h3 className="font-bold text-slate-800 text-lg mb-1">{vendor.name}</h3>
            
            <div className="space-y-2 mt-4">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <User size={14} className="text-slate-400" />
                <span>{vendor.contactPerson || "No contact person"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Phone size={14} className="text-slate-400" />
                <span>{vendor.phone || "No phone listed"}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}