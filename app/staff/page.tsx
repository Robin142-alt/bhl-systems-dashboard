import { MessageSquare, UserPlus } from "lucide-react";
import StaffDirectoryClient from "@/components/StaffDirectoryClient";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const staffMembers = await prisma.user.findMany({
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phoneNumber: true,
      whatsappOptIn: true,
    },
  });

  const optedInCount = staffMembers.filter((member) => member.whatsappOptIn).length;

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">BHL Staff Directory</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            Set each person’s WhatsApp number and opt-in status so deadline reminders and manager escalations reach the right phones.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700">
          <UserPlus size={18} /> Add Member
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Total Staff</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{staffMembers.length}</p>
        </div>
        <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">WhatsApp Opted In</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{optedInCount}</p>
        </div>
        <div className="rounded-[2rem] border border-green-100 bg-green-50 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <MessageSquare className="text-green-600" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-green-700">Reminder Channel</p>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                WhatsApp reminders run against staff marked as opted in.
              </p>
            </div>
          </div>
        </div>
      </div>

      <StaffDirectoryClient members={staffMembers} />
    </div>
  );
}
