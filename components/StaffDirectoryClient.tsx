"use client";

import { useState, useTransition } from "react";
import { Briefcase, Mail, MessageSquare, Save } from "lucide-react";
import { toast } from "sonner";
import { updateEmployeeWhatsAppSettings } from "@/app/actions";
import { maskPhoneNumber } from "@/lib/phone";

interface StaffMember {
  id: number;
  name: string | null;
  email: string;
  role: string;
  phoneNumber: string | null;
  whatsappOptIn: boolean;
}

function StaffCard({ member }: { member: StaffMember }) {
  const [phoneNumber, setPhoneNumber] = useState(member.phoneNumber ?? "");
  const [whatsappOptIn, setWhatsappOptIn] = useState(member.whatsappOptIn);
  const [isPending, startTransition] = useTransition();

  const handleSave = () => {
    startTransition(async () => {
      const result = await updateEmployeeWhatsAppSettings(
        member.id,
        phoneNumber,
        whatsappOptIn,
      );

      if (!result.success) {
        toast.error(result.message || "Could not update WhatsApp settings.");
        return;
      }

      setPhoneNumber(result.phoneNumber ?? "");
      setWhatsappOptIn(Boolean(result.optedIn));
      toast.success(`WhatsApp settings saved for ${member.name || member.email}.`);
    });
  };

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="rounded-2xl bg-slate-100 p-4 text-blue-600">
          <Briefcase size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-black text-slate-900">{member.name || "Unnamed Staff"}</h2>
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
            <Mail size={14} />
            <span className="truncate">{member.email}</span>
          </div>
          <p className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-blue-600">
            {member.role.replaceAll("_", " ")}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            WhatsApp Number
          </label>
          <input
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="0712345678 or +254712345678"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400"
          />
          <p className="mt-2 text-xs text-slate-500">
            Current: <span className="font-semibold">{maskPhoneNumber(member.phoneNumber)}</span>
          </p>
        </div>

        <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={whatsappOptIn}
            onChange={(event) => setWhatsappOptIn(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="flex items-center gap-2">
            <MessageSquare size={16} className="text-green-600" />
            Enable WhatsApp reminders for this staff member
          </span>
        </label>

        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save size={14} />
          {isPending ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

export default function StaffDirectoryClient({ members }: { members: StaffMember[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      {members.map((member) => (
        <StaffCard key={member.id} member={member} />
      ))}
    </div>
  );
}
