import { prisma } from "@/lib/prisma";
import { Clock, CheckCircle2, ListChecks } from "lucide-react";
import ComplianceTable from "@/components/ComplianceTable";
import React from "react";

export const dynamic = 'force-dynamic';

// Define strict types for the StatCard component
interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
  shadow: string;
}

export default async function Home() {
  const items = await prisma.complianceItem.findMany({
    orderBy: { deadline: 'asc' }
  });

  const pendingCount = items.filter(i => i.status === "Pending").length;
  const completedCount = items.filter(i => i.status === "Completed").length;

  return (
    <div className="space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={<ListChecks size={28}/>} label="TOTAL ITEMS" value={items.length} color="bg-blue-600" shadow="shadow-blue-200" />
        <StatCard icon={<Clock size={28}/>} label="PENDING" value={pendingCount} color="bg-amber-500" shadow="shadow-amber-200" />
        <StatCard icon={<CheckCircle2 size={28}/>} label="COMPLETED" value={completedCount} color="bg-emerald-500" shadow="shadow-emerald-200" />
      </div>

      <ComplianceTable items={items} />
    </div>
  );
}

function StatCard({ icon, label, value, color, shadow }: StatCardProps) {
  return (
    <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-gray-50 flex items-center gap-8 group hover:scale-[1.02] transition-transform">
      <div className={`${color} p-5 rounded-3xl text-white shadow-2xl ${shadow}/40`}>
        {icon}
      </div>
      <div>
        <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em] mb-1">{label}</p>
        <p className="text-4xl font-black text-gray-900 tracking-tighter leading-none">{value}</p>
      </div>
    </div>
  );
}