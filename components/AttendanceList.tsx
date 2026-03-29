"use client";

import { useState } from "react";
import { toggleAttendance, generateCertificateRecord } from "@/app/actions";
import { Check, X, Award, Eye, Loader2 } from "lucide-react";
import Link from "next/link";

interface StaffMember {
  id: number;
  attendanceId?: number;
  name: string | null;
  email: string;
  attended: boolean;
  certificateNo?: string | null;
}

export default function AttendanceList({ 
  trainingId, 
  initialStaff 
}: { 
  trainingId: number; 
  initialStaff: StaffMember[];
}) {
  const [staff, setStaff] = useState(initialStaff);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  // Handle Attendance Toggle
  const handleToggle = async (userId: number) => {
    setLoadingId(userId);
    await toggleAttendance(trainingId, userId);
    
    // Update local UI state
    setStaff(prev => prev.map(s => 
      s.id === userId ? { ...s, attended: !s.attended } : s
    ));
    setLoadingId(null);
  };

  // Handle Certificate Generation
  const handleGenerateCert = async (attendanceId: number, userId: number) => {
    setLoadingId(userId);
    const certNo = await generateCertificateRecord(attendanceId);
    
    if (certNo) {
      // Update local UI state with the new certificate number
      setStaff(prev => prev.map(s => 
        s.id === userId ? { ...s, certificateNo: certNo } : s
      ));
    }
    setLoadingId(null);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <table className="w-full text-left border-collapse">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Staff Member</th>
            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</th>
            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {staff.map((member) => (
            <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
              <td className="px-6 py-4">
                <p className="font-semibold text-slate-900">{member.name || "Unnamed Staff"}</p>
                <p className="text-xs text-slate-500">{member.email}</p>
              </td>
              <td className="px-6 py-4">
                <button
                  onClick={() => handleToggle(member.id)}
                  disabled={loadingId === member.id}
                  className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                    member.attended 
                      ? "bg-green-100 text-green-700 hover:bg-green-200" 
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {member.attended ? <Check size={14} /> : <X size={14} />}
                  {member.attended ? "Attended" : "Absent"}
                </button>
              </td>
              <td className="px-6 py-4 text-right">
                {member.attended && member.attendanceId ? (
                  member.certificateNo ? (
                    <Link
                      href={`/dashboard/certificates/${member.certificateNo}`}
                      className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 text-xs font-bold underline decoration-2 underline-offset-4"
                    >
                      <Eye size={14} /> View Certificate
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleGenerateCert(member.attendanceId!, member.id)}
                      disabled={loadingId === member.id}
                      className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                    >
                      {loadingId === member.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Award size={14} />
                      )}
                      Generate Cert
                    </button>
                  )
                ) : (
                  <span className="text-[10px] text-slate-300 italic">No Actions</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}