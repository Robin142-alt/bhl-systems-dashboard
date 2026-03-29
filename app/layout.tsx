"use client"; 

import "./globals.css";
import { LayoutDashboard, History, ShieldCheck, PieChart, LogOut } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { signOut, SessionProvider, useSession } from "next-auth/react"; 
import { Toaster } from "sonner"; // Added Sonner for notifications

// --- SMART HEADER COMPONENT ---
function SmartHeader() {
  const { data: session } = useSession();
  const userRole = session?.user?.role || "GUEST";
  const userEmail = session?.user?.email || "Not Signed In";

  return (
    <header className="no-print flex justify-between items-center mb-10 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
      <div>
        <h2 className="text-slate-400 text-xs font-black uppercase tracking-[0.2em]">BHL OPERATIONAL HUB</h2>
        <h1 className="text-2xl font-black text-slate-800">Strategic Oversight & Compliance</h1>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-bold text-slate-800 capitalize">{userRole.toLowerCase()}</p>
          <p className="text-[10px] font-bold text-green-500 uppercase">{userEmail}</p>
        </div>
        <div className="w-10 h-10 bg-slate-200 rounded-full border-2 border-white shadow-md overflow-hidden">
          <Image 
            src={`https://ui-avatars.com/api/?name=${userRole}&background=0D8ABC&color=fff`} 
            alt="User" 
            width={40} 
            height={40} 
          />
        </div>
      </div>
    </header>
  );
}

// --- SIDEBAR CONTENT ---
function SidebarContent() {
  const { data: session } = useSession();
  const userRole = session?.user?.role;

  return (
    <aside className="no-print w-64 bg-[#0f172a] text-white flex flex-col fixed h-full shadow-2xl">
      <div className="p-6 flex items-center gap-3 border-b border-slate-700">
        <div className="bg-blue-500 p-2 rounded-xl shadow-lg shadow-blue-500/50">
          <ShieldCheck size={24} />
        </div>
        <span className="font-black text-xl tracking-tighter uppercase">BHL Systems</span>
      </div>

      <nav className="flex-grow p-4 space-y-2 mt-4">
        <p className="text-[10px] font-bold text-slate-500 uppercase px-4 mb-4">Management</p>
        <Link href="/" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-800 transition-all group text-slate-300 hover:text-white">
          <LayoutDashboard size={20} className="group-hover:text-blue-400" />
          <span className="font-bold text-sm">Dashboard</span>
        </Link>

        {(userRole === "ADMIN" || userRole === "HR") && (
          <Link href="/history" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-800 transition-all group text-slate-300 hover:text-white">
            <History size={20} className="group-hover:text-green-400" />
            <span className="font-bold text-sm">Staff Records</span>
          </Link>
        )}

        <p className="text-[10px] font-bold text-slate-500 uppercase px-4 mt-8 mb-4">Analytics</p>
        
        {(userRole === "ADMIN" || userRole === "ACCOUNTANT") ? (
          <Link href="/budget" className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-800 transition-all group text-slate-300 hover:text-white">
            <PieChart size={20} className="group-hover:text-yellow-400" />
            <span className="font-bold text-sm">Budget Reports</span>
          </Link>
        ) : (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-not-allowed opacity-30 text-slate-400">
            <PieChart size={20} />
            <span className="font-bold text-sm italic">Restricted</span>
          </div>
        )}
      </nav>

      <div className="p-4 border-t border-slate-700 space-y-2">
        <button 
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-500/10 text-red-400 transition-all group"
        >
          <LogOut size={20} className="group-hover:translate-x-1 transition-transform" />
          <span className="font-bold text-sm text-left">Exit System</span>
        </button>

        <div className="bg-slate-800 p-4 rounded-2xl">
          <p className="text-[10px] font-bold text-blue-400 uppercase">System Status</p>
          <div className="flex items-center gap-2 mt-1">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-ping" />
            <span className="text-xs font-bold text-slate-300">Database Online</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

// --- ROOT LAYOUT ---
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#f8fafc] text-slate-900 font-sans">
        <SessionProvider> 
          <div className="flex min-h-screen">
            <SidebarContent />
            <main className="flex-grow ml-64 p-8">
              <SmartHeader /> 
              <section className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                {children}
              </section>
            </main>
          </div>
          {/* SUCCESS TOASTS 
            Adding the Toaster here makes it available to every page 
          */}
          <Toaster position="top-right" richColors closeButton />
        </SessionProvider>
      </body>
    </html>
  );
}