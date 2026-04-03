"use client";

import { useState, FormEvent } from "react";
import { Award, Mail, Link, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

// 1. Define strict interfaces
interface Training {
  id: number;
  title: string;
}

interface FormStatus {
  type: 'success' | 'error';
  msg: string;
}

export default function RecordAchievementForm({ trainings }: { trainings: Training[] }) {
  const [loading, setLoading] = useState<boolean>(false);
  const [status, setStatus] = useState<FormStatus | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);

    // 2. Type-safe extraction of form data
    const formData = new FormData(e.currentTarget);
    const trainingId = formData.get("trainingId") as string;
    const staffEmail = formData.get("staffEmail") as string;
    const certificateUrl = formData.get("certificateUrl") as string;

    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        body: JSON.stringify({ trainingId, staffEmail, certificateUrl }),
        headers: { "Content-Type": "application/json" },
      });

      const result = await res.json();

      if (!res.ok) {
        // Handle specific API error messages
        throw new Error(result.error || "Authorization failed");
      }

      setStatus({ type: 'success', msg: "BHL Achievement Successfully Archived" });
      (e.target as HTMLFormElement).reset(); 
      
    } catch (err) {
      // 3. NO 'ANY' - We check the type of the error safely
      const errorMessage = err instanceof Error ? err.message : "An unexpected system error occurred";
      setStatus({ type: 'error', msg: errorMessage });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-xl bg-white p-8 rounded-[2rem] border border-slate-100 shadow-2xl">
      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Target Personnel</label>
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
          <input 
            name="staffEmail" 
            type="email" 
            required 
            placeholder="staff@bhl.com"
            className="w-full bg-slate-50 border-none p-4 pl-12 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all font-bold text-slate-900"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Completed Training</label>
        <div className="relative">
          <Award className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
          <select 
            name="trainingId" 
            required 
            className="w-full bg-slate-50 border-none p-4 pl-12 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all font-bold appearance-none text-slate-900"
          >
            <option value="">Select a Course...</option>
            {trainings.map(t => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Document URL</label>
        <div className="relative">
          <Link className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
          <input 
            name="certificateUrl" 
            type="url" 
            required
            placeholder="https://bhl-storage.com/cert-id"
            className="w-full bg-slate-50 border-none p-4 pl-12 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all font-bold text-slate-900"
          />
        </div>
      </div>

      {status && (
        <div className={`p-4 rounded-xl font-bold text-xs flex items-center gap-2 animate-in fade-in zoom-in duration-300 ${
          status.type === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
        }`}>
          {status.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {status.msg}
        </div>
      )}

      <button 
        disabled={loading}
        className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-black transition-all flex items-center justify-center gap-2 shadow-xl disabled:opacity-50 active:scale-95"
      >
        {loading ? <Loader2 className="animate-spin" /> : "Authorize Achievement"}
      </button>
    </form>
  );
}