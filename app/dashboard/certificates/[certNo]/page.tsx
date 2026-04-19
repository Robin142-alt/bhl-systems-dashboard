import React from 'react';
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import PrintButton from "@/components/PrintButton";

export const dynamic = 'force-dynamic';

export default async function CertificatePage({ 
  params 
}: { 
  params: Promise<{ certNo: string }> 
}) {
  const { certNo } = await params;

  // 1. Fetch Certificate with deep relations
  const cert = await prisma.certificate.findUnique({
    where: { certificateNo: certNo },
    include: {
      attendance: {
        include: {
          user: true,
          training: true
        }
      }
    }
  });

  if (!cert) return notFound();

  const { user, training } = cert.attendance;

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8 md:p-12 print:bg-white print:p-0">
      
      {/* 2. NAVIGATION (Hidden on Print) */}
      <div className="max-w-4xl mx-auto mb-8 flex justify-between items-center print:hidden">
        <Link 
          href={`/dashboard/training/${training.id}`}
          className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-blue-600 transition-colors"
        >
          <ChevronLeft size={16} /> Back to Training
        </Link>
        
        <PrintButton />
      </div>

      {/* 3. THE ACTUAL CERTIFICATE (The Printable Area) */}
      <div className="max-w-4xl mx-auto bg-white shadow-2xl border-[16px] border-double border-blue-900 p-12 relative overflow-hidden print:shadow-none print:border-[12px] print:max-w-full print:m-0">
        
        {/* Background Watermark Decoration */}
        <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-blue-50 rounded-full opacity-50 blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-slate-50 rounded-full opacity-50 blur-3xl pointer-events-none" />

        <div className="relative z-10 text-center border-4 border-slate-100 p-8">
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-4xl font-black text-blue-900 uppercase tracking-tighter text-center">BHL SYSTEMS</h2>
            <div className="h-1 w-24 bg-blue-600 mx-auto mt-2" />
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-4 text-center">Certificate of Completion</p>
          </div>

          <p className="text-gray-500 italic font-serif text-lg mb-4 text-center">This is to certify that</p>
          
          <h1 className="text-5xl font-black text-slate-900 mb-6 font-serif text-center">
            {user.name || "Valued Staff Member"}
          </h1>

          <p className="text-gray-500 italic font-serif text-lg mb-6 text-center">has successfully completed the professional training program in</p>

          <div className="bg-slate-50 py-6 px-4 rounded-xl mb-10 border border-slate-100">
            <h3 className="text-2xl font-bold text-blue-800 uppercase tracking-wide text-center">
              {training.title}
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-12 mt-12 items-end">
            {/* Signature Area */}
            <div className="text-left border-t-2 border-slate-200 pt-4">
              <p className="font-serif italic text-slate-800 text-lg">BHL Management</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Authorized Signature</p>
            </div>

            {/* Verification Details */}
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Certificate No.</p>
              <p className="font-mono text-blue-600 font-bold">{cert.certificateNo}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-4 mb-1">Issue Date</p>
              <p className="font-semibold text-slate-800">
                {new Date(cert.issueDate).toLocaleDateString('en-KE', { 
                  day: 'numeric', 
                  month: 'long', 
                  year: 'numeric' 
                })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}