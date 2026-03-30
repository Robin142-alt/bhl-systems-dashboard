"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import AddVendorModal from "./AddVendorModal";

export default function VendorClient() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button 
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-all shadow-sm font-medium"
      >
        <Plus size={18} />
        Add New Vendor
      </button>

      <AddVendorModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </>
  );
}