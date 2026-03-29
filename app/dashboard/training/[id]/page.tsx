import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import AttendanceList from "@/components/AttendanceList";

export default async function TrainingDetailsPage({ 
  params 
}: { 
  params: { id: string } 
}) {
  const trainingId = parseInt(params.id);

  // 1. Fetch the specific training details
  const training = await prisma.training.findUnique({
    where: { id: trainingId },
    include: {
      createdBy: true,
    }
  });

  if (!training) {
    return notFound();
  }

  // 2. Fetch all staff members (Users)
  const allUsers = await prisma.user.findMany({
    orderBy: { name: 'asc' }
  });

  // 3. Fetch existing attendance records AND their linked certificates
  const attendanceRecords = await prisma.attendance.findMany({
    where: { trainingId: trainingId },
    include: { 
      certificate: true // 👈 JOIN: Brings in the certificate data
    }
  });

  // 4. Map them together (The "Senior" logic)
  // We use .find() to get the specific attendance record for each user
  const staffData = allUsers.map(user => {
    const record = attendanceRecords.find(a => a.userId === user.id);
    
    return {
      id: user.id,
      attendanceId: record?.id,
      name: user.name,
      email: user.email,
      attended: record ? record.attended : false,
      certificateNo: record?.certificate?.certificateNo // 👈 Pass the number to the UI
    };
  });

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{training.title}</h1>
            <p className="text-gray-500 mt-2 max-w-2xl">{training.description}</p>
          </div>
          <div className="bg-white border border-gray-200 px-4 py-2 rounded-lg shadow-sm">
            <p className="text-[10px] text-gray-400 uppercase font-bold">Status</p>
            <p className="text-sm font-semibold text-blue-600 tracking-wide">
              {training.status || "Active"}
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Location</p>
            <p className="text-sm font-semibold text-slate-700">{training.location || "BHL Headquarters"}</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Cost</p>
            <p className="text-sm font-semibold text-slate-700">KES {training.costKES.toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Coordinator</p>
            <p className="text-sm font-semibold text-slate-700">{training.createdBy.name || "HR Admin"}</p>
          </div>
        </div>
      </div>

      <div className="mt-10">
        <AttendanceList 
          trainingId={trainingId} 
          initialStaff={staffData} 
        />
      </div>
    </div>
  );
}