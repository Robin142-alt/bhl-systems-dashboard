"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { ShieldCheck, Lock, Mail, AlertCircle, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      // Race the signIn call against a 20-second timeout to prevent
      // the login from hanging indefinitely in production
      const res = await Promise.race([
        signIn("credentials", {
          email,
          password,
          redirect: false,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 20000)
        ),
      ]);

      if (res?.error) {
        setError("Invalid username or password. Please try again.");
        setIsLoading(false);
      } else if (res?.ok) {
        // Use a hard redirect instead of router.push() so the browser
        // performs a full page load and the middleware correctly reads
        // the newly-set session cookie from the response.
        window.location.href = "/dashboard";
      } else {
        setError("An unexpected error occurred. Please try again.");
        setIsLoading(false);
      }
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === "timeout";
      setError(
        isTimeout
          ? "Login timed out — the server is taking too long. Please try again."
          : "Connection error. Please check your network and try again."
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white dark:bg-[#020617] text-slate-900 dark:text-slate-100">
      
      {/* LEFT SIDE - BRANDING (Hidden on Mobile) */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-blue-900 to-[#020617] p-12 flex-col justify-between relative overflow-hidden">
        {/* Abstract Background Shapes */}
        <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[10%] right-[-10%] w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="bg-blue-500 p-2.5 rounded-xl shadow-lg shadow-blue-500/50">
            <ShieldCheck size={28} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="font-black text-2xl tracking-tighter uppercase italic text-white">BHL Systems</span>
        </div>

        <div className="relative z-10 max-w-lg">
          <h1 className="text-5xl font-black text-white leading-tight tracking-tight mb-6">
            Strategic Oversight & <span className="text-blue-400">Compliance</span> Platform.
          </h1>
          <p className="text-blue-100/70 text-lg font-medium leading-relaxed mb-8">
            Manage your corporate governance, track vital compliance deadlines, and streamline your operational efficiency in one secure portal.
          </p>
          <div className="flex items-center gap-4 text-blue-300 text-sm font-bold uppercase tracking-widest">
            <span>Enterprise Grade</span>
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
            <span>Secure Access</span>
          </div>
        </div>

        <div className="relative z-10 text-blue-200/50 text-xs font-bold uppercase tracking-widest">
          &copy; {new Date().getFullYear()} BHL Management Systems. All rights reserved.
        </div>
      </div>

      {/* RIGHT SIDE - LOGIN FORM */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative z-10 bg-white dark:bg-[#020617]">
        <div className="w-full max-w-[450px]">
          
          {/* Mobile Logo (Visible only on small screens) */}
          <div className="lg:hidden flex flex-col items-center mb-10 text-center">
            <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-500/30 mb-4">
              <ShieldCheck size={32} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="font-black text-3xl tracking-tighter uppercase italic text-slate-900 dark:text-white">BHL Systems</span>
          </div>

          <div className="mb-10 text-center lg:text-left">
            <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-2">Secure Staff Access</h2>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Enter your credentials to access the portal.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-2xl flex items-start gap-3 text-sm font-bold border border-red-100 dark:border-red-900/50 animate-in fade-in slide-in-from-top-2">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <p>{error}</p>
              </div>
            )}

            <div className="space-y-2 group">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                </div>
                <input 
                  type="email" 
                  placeholder="admin@bhl.com" 
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            <div className="space-y-2 group">
              <div className="flex justify-between items-center">
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Password</label>
                <a href="#" className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:hover:text-blue-400 transition-colors">Forgot?</a>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                </div>
                <input 
                  type="password" 
                  placeholder="••••••••" 
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium"
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <input type="checkbox" id="remember" className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-blue-600 focus:ring-blue-500 cursor-pointer" />
              <label htmlFor="remember" className="text-sm font-medium text-slate-600 dark:text-slate-400 cursor-pointer select-none">Remember me for 30 days</label>
            </div>

            <button 
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-black text-sm transition-all shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 flex items-center justify-center gap-2 uppercase tracking-widest disabled:opacity-70 disabled:cursor-not-allowed group mt-8"
            >
              {isLoading ? "Authenticating..." : "Authorize Entry"}
              {!isLoading && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}