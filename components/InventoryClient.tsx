"use client";

import { useState } from "react";
import { Plus, MinusCircle } from "lucide-react";
import AddItemModal from "./AddItemModal";
import IssueStockModal from "./IssueStockModal"; // New Import
import { InventoryItem } from "@prisma/client";

interface InventoryClientProps {
  items: InventoryItem[];
}

export default function InventoryClient({ items }: InventoryClientProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isIssueOpen, setIsIssueOpen] = useState(false);

  return (
    <div className="flex items-center gap-3">
      <button 
        onClick={() => setIsIssueOpen(true)}
        className="bg-white text-slate-900 border border-slate-200 px-4 py-2 rounded-lg font-bold hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm"
      >
        <MinusCircle size={18} className="text-blue-600" />
        Issue Stock
      </button>

      <button 
        onClick={() => setIsAddOpen(true)}
        className="bg-slate-900 text-white px-4 py-2 rounded-lg font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-sm"
      >
        <Plus size={18} />
        Add Item
      </button>

      <AddItemModal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
      
      <IssueStockModal 
        isOpen={isIssueOpen} 
        onClose={() => setIsIssueOpen(false)} 
        items={items}
      />
    </div>
  );
}