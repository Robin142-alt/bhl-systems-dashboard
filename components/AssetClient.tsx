"use client";

import { useState } from "react";
import { Plus, Wrench } from "lucide-react";
import RegisterAssetModal from "./RegisterAssetModal";
import AddMaintenanceModal from "./AddMaintenanceModal";
import { Asset, Vendor } from "@prisma/client";

interface Props {
  assets: Asset[];
  vendors: Vendor[];
}

export default function AssetClient({ assets, vendors }: Props) {
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false);

  return (
    <div className="flex gap-3">
      <button 
        onClick={() => setIsMaintenanceOpen(true)}
        className="bg-amber-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-amber-700 transition-all flex items-center gap-2 shadow-sm"
      >
        <Wrench size={18} />
        Log Maintenance
      </button>

      <button 
        onClick={() => setIsRegisterOpen(true)}
        className="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-sm"
      >
        <Plus size={18} />
        Register Asset
      </button>

      <RegisterAssetModal isOpen={isRegisterOpen} onClose={() => setIsRegisterOpen(false)} />
      
      <AddMaintenanceModal 
        isOpen={isMaintenanceOpen} 
        onClose={() => setIsMaintenanceOpen(false)} 
        assets={assets}
        vendors={vendors}
      />
    </div>
  );
}