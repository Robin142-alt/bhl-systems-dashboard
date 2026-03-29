"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react"; // Removed 'Plus'

export function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button 
      type="submit" 
      disabled={pending}
      className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-black px-8 rounded-2xl transition-all active:scale-95 shadow-lg shadow-blue-500/30 flex items-center justify-center min-w-[120px]"
    >
      {pending ? (
        <Loader2 className="animate-spin" size={20} />
      ) : (
        "Save"
      )}
    </button>
  );
}