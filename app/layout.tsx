"use client";

import "./globals.css";
import { 
  LayoutDashboard,  
  ShieldCheck, 
  PieChart, 
  LogOut, 
  Package, 
  Truck, 
  Activity,
  Award,
  BookOpen,
  Cpu,
  Briefcase
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut, SessionProvider, useSession } from "next-auth/react";
import { Toaster } from "sonner";
import AiAssistant from "@/components/AiAssistant";

// --- SMART HEADER COMPONENT ---
function SmartHeader() {
  const { data: session } = useSession();
  const userRole = session?.user?.role || "GUEST";
  const userEmail = session?.user?.email || "Not Signed In";

  return (
    <header className="no-print flex justify-between items-center mb-8 p-6 rounded-[2rem] transition-all duration-300
      bg-white dark:bg-slate-900 
      border border-slate-100 dark:border-slate-800 
      shadow-sm dark:shadow-none">
      <div>
        <h2 className="text-blue-600 dark:text-blue-400 text-[10px] font-black uppercase tracking-[0.3em] mb-1">BHL OPERATIONAL HUB</h2>
        <h1 className="text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight">Strategic Oversight & Compliance</h1>
      </div>
      <div className="flex items-center gap-5">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-black text-slate-900 dark:text-white leading-none mb-1">{userRole}</p>
          <p className="text-[10px] font-bold text-green-500 dark:text-green-400 uppercase tracking-wider">{userEmail}</p>
        </div>
        <div className="w-12 h-12 rounded-2xl border-2 border-white dark:border-slate-700 shadow-sm overflow-hidden flex items-center justify-center bg-slate-100 dark:bg-slate-800">
          <Image 
            src={`https://ui-avatars.com/api/?name=${userRole}&background=0f172a&color=fff&bold=true`} 
            alt="User Profile" 
            width={48} 
            height={48} 
          />
        </div>
      </div>
    </header>
  );
}

// --- SIDEBAR COMPONENT ---
function SidebarContent() {
  const { data: session } = useSession();
  const userRole = session?.user?.role;
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  const navLinkClass = (path: string) => `
    flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group
    ${isActive(path) 
      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/40' 
      : 'text-slate-400 hover:bg-slate-800 dark:hover:bg-slate-800/50 hover:text-white'}
  `;

  return (
    <aside className="no-print w-64 bg-[#020617] text-white flex flex-col fixed h-full shadow-2xl z-50">
      <div className="p-8 flex items-center gap-3 border-b border-slate-800/50">
        <div className="bg-blue-500 p-2 rounded-xl shadow-lg shadow-blue-500/50">
          <ShieldCheck size={24} strokeWidth={2.5} />
        </div>
        <span className="font-black text-xl tracking-tighter uppercase italic">BHL Systems</span>
      </div>

      <nav className="flex-grow p-4 space-y-1 mt-4 overflow-y-auto custom-scrollbar">
        <p className="text-[10px] font-black text-slate-600 uppercase px-4 mb-3 tracking-[0.2em]">Operations</p>
        
        <Link href="/" className={navLinkClass("/")}>
          <LayoutDashboard size={20} />
          <span className="font-bold text-sm">Dashboard</span>
        </Link>

        {/* --- ADDED OFFICE ADMIN LINK --- */}
        <Link href="/dashboard/office" className={navLinkClass("/dashboard/office")}>
          <Briefcase size={20} />
          <span className="font-bold text-sm">Office Admin</span>
        </Link>

        {/* --- ADDED TRAINING LINK HERE --- */}
        <Link href="/dashboard/training" className={navLinkClass("/dashboard/training")}>
          <BookOpen size={20} />
          <span className="font-bold text-sm">Training Hub</span>
        </Link>

        {(userRole === "ADMIN" || userRole === "HR" || userRole === "OPERATIONS_MANAGER") && (
          <>
            <Link href="/history" className={navLinkClass("/history")}>
              <Award size={20} />
              <span className="font-bold text-sm">Staff Records</span>
            </Link>
            <Link href="/dashboard/inventory" className={navLinkClass("/dashboard/inventory")}>
              <Package size={20} />
              <span className="font-bold text-sm">Inventory</span>
            </Link>
          </>
        )}

        <p className="text-[10px] font-black text-slate-600 uppercase px-4 mt-8 mb-3 tracking-[0.2em]">Strategy & Finance</p>
        
        {(userRole === "ADMIN" || userRole === "ACCOUNTANT" || userRole === "HR") && (
          <>
            <Link href="/dashboard/reports" className={navLinkClass("/dashboard/reports")}>
              <PieChart size={20} />
              <span className="font-bold text-sm">Budget Reports</span>
            </Link>
            <Link href="/dashboard/vendors" className={navLinkClass("/dashboard/vendors")}>
              <Truck size={20} />
              <span className="font-bold text-sm">Vendor Hub</span>
            </Link>
            <Link href="/dashboard/expenses" className={navLinkClass("/dashboard/expenses")}>
              <Activity size={20} />
              <span className="font-bold text-sm">Expense Logs</span>
            </Link>
          </>
        )}

        <p className="text-[10px] font-black text-slate-600 uppercase px-4 mt-8 mb-3 tracking-[0.2em]">Technology & Systems</p>
        
        {(userRole === "ADMIN" || userRole === "OPERATIONS_MANAGER" || userRole === "HR") && (
          <Link href="/dashboard/ict" className={navLinkClass("/dashboard/ict")}>
            <Cpu size={20} />
            <span className="font-bold text-sm">ICT Hub</span>
          </Link>
        )}
      </nav>

      <div className="p-4 border-t border-slate-800/50 space-y-4 bg-[#020617]">
        <button 
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-500/10 text-red-400 transition-all group"
        >
          <LogOut size={20} className="group-hover:translate-x-1 transition-transform" />
          <span className="font-bold text-sm text-left">Exit System</span>
        </button>

        <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
          <div className="flex justify-between items-center mb-1">
            <p className="text-[10px] font-black text-blue-400 uppercase tracking-tighter">System Status</p>
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          </div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">PRODUCTION V1.2.0</span>
        </div>
      </div>
    </aside>
  );
}

// --- MAIN LAYOUT WRAPPER ---
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login";

  return (
    <html lang="en" className="scroll-smooth" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body suppressHydrationWarning className="antialiased overflow-x-hidden transition-colors duration-300 min-h-screen
        bg-[#f8fafc] dark:bg-[#020617] 
        text-slate-900 dark:text-slate-100">
        <SessionProvider> 
          {isAuthPage ? (
            <main className="min-h-screen bg-[#020617]">{children}</main>
          ) : (
            <div className="flex min-h-screen">
              <SidebarContent />
              
              {/* Main Content Area */}
              <div className="flex-grow ml-64 min-h-screen transition-all duration-300">
                <div className="max-w-[1600px] mx-auto p-8">
                  <SmartHeader /> 
                  <main className="animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out">
                    {children}
                  </main>
                </div>
              </div>
            </div>
          )}

          <Toaster 
            position="top-right" 
            richColors 
            closeButton 
            toastOptions={{
              style: { 
                borderRadius: '1.25rem', 
                border: 'none', 
                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                background: 'var(--card)',
                color: 'var(--foreground)'
              },
            }}
          />
          {!isAuthPage && <AiAssistant />}
        </SessionProvider>
      </body>
    </html>
  );
}