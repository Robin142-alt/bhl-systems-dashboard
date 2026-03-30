import { prisma } from "@/lib/prisma";
import { Mail, Briefcase, UserPlus } from "lucide-react";

export default async function StaffPage() {
  // Fetch users from your database using the Prisma client we just fixed
  const staffMembers = await prisma.user.findMany({
    orderBy: { name: 'asc' }
  });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold text-slate-900">BHL Staff Directory</h1>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700">
          <UserPlus size={20} /> Add Member
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {staffMembers.map((member) => (
          <div key={member.id} className="bg-white border rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className="bg-slate-100 p-4 rounded-full text-blue-600">
                <Briefcase size={24} />
              </div>
              <div>
                <h2 className="font-bold text-lg">{member.name}</h2>
                <div className="flex items-center gap-2 text-slate-500 text-sm">
                  <Mail size={14} />
                  <span>{member.email}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}