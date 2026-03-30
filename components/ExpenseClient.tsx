"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import AddExpenseModal from "./AddExpenseModal";
import { Vendor } from "@prisma/client";

interface ExpenseClientProps {
  vendors: Vendor[];
}

export default function ExpenseClient({ vendors }: ExpenseClientProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <button 
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-all shadow-sm font-medium"
      >
        <Plus size={18} />
        Log New Expense
      </button>

      <AddExpenseModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        vendors={vendors}
      />
    </>
  );
}