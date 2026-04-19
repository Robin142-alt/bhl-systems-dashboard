import { prisma } from "@/lib/prisma";
import { Mail, Calendar, MapPin, ArrowLeft, CheckCircle, FileText, Printer } from "lucide-react";
import Link from "next/link";

export const dynamic = 'force-dynamic';

// This defines exactly what a "Staff Record" looks like for TypeScript
interface AttendeeRecord {
  id: number;
  staffName: string;
  staffEmail: string;
  certificateUrl: string | null;
}

export default async function TrainingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // FETCH: Using 'attendees' to match your schema.prisma
  const training = await prisma.training.findUnique({
    where: { id: Number(id) },
    include: {
      attendees: true, 
    },
  });

  if (!training) return <div className="p-10 text-center font-bold text-slate-500">Training not found!</div>;

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      
      {/* 1. TOP NAVIGATION & PRINT BUTTON */}
      <div className="flex justify-between items-center no-print">
        <Link href="/trainings" className="flex items-center gap-2 text-slate-400 hover:text-blue-600 transition-colors font-bold text-sm">
          <ArrowLeft size={16} /> Back to List
        </Link>
        
        <button 
          onClick={() => typeof window !== 'undefined' && window.print()} 
          className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
        >
          <Printer size={16} /> Print Attendance Sheet
        </button>
      </div>

      {/* 2. HEADER CARD (Blue/Dark Section) */}
      <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden print-header">
        <div className="relative z-10">
          <h1 className="text-4xl font-black mb-4 tracking-tight">{training.title}</h1>
          <div className="flex flex-wrap gap-6 text-slate-400 text-sm font-medium">
            <span className="flex items-center gap-2">
              <Calendar size={18} className="text-blue-400"/> 
              {new Date(training.startDate).toLocaleDateString()}
            </span>
            <span className="flex items-center gap-2">
              <MapPin size={18} className="text-blue-400"/> 
              {training.location || "Main Office"}
            </span>
          </div>
        </div>
      </div>

      {/* 3. ATTENDANCE LIST SECTION */}
      <div className="bg-white rounded-[2.5rem] p-10 border border-slate-100 shadow-sm print-list">
        <h2 className="text-xl font-black text-slate-800 mb-6 tracking-tight">
           Verified Attendees
        </h2>
        
        <div className="space-y-4">
          {(!training.attendees || training.attendees.length === 0) ? (
            <div className="text-center py-10 bg-slate-50 rounded-3xl border border-dashed border-slate-200 text-slate-400 font-medium">
              No staff members have been logged for this session yet.
            </div>
          ) : (
            (training.attendees as unknown as AttendeeRecord[]).map((record) => (
              <div key={record.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 print-row">
                <div className="flex items-center gap-4">
                  <div className="bg-emerald-100 text-emerald-600 p-2 rounded-full">
                    <CheckCircle size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{record.staffName}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Mail size={12} /> {record.staffEmail}
                    </p>
                  </div>
                </div>
                
                {/* CERTIFICATE LINK with FileText Icon */}
                {record.certificateUrl && (
                  <a 
                    href={record.certificateUrl} 
                    target="_blank" 
                    rel="noreferrer"
                    className="no-print flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-600 bg-blue-50 px-3 py-1 rounded-lg hover:bg-blue-600 hover:text-white transition-all"
                  >
                    <FileText size={12} /> 
                    <span>View Cert</span>
                  </a>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 4. SECRET PRINT STYLES (Keeps the printout pretty) */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; padding: 0 !important; }
          .print-header { 
            background: white !important; 
            color: black !important; 
            border-bottom: 2px solid black !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            padding: 20px 0 !important;
          }
          .print-list { border: none !important; box-shadow: none !important; padding: 0 !important; }
          .print-row { border-bottom: 1px solid #eee !important; border-radius: 0 !important; background: transparent !important; }
          .text-blue-400 { color: black !important; }
          .text-slate-400 { color: #666 !important; }
        }
      `}} />

    </div> // Final closing tag for the main container
  );
}