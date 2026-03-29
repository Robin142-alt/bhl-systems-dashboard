"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { ShieldCheck, Lock, Mail } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // This tells the computer: "Check if this person is in the database!"
    await signIn("credentials", {
      email,
      password,
      callbackUrl: "/", // Send them to the dashboard if they succeed
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] p-6">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-10">
        <div className="flex flex-col items-center mb-10">
          <div className="bg-blue-600 p-4 rounded-2xl shadow-lg shadow-blue-200 mb-4">
            <ShieldCheck size={40} className="text-white" />
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">BHL GATEWAY</h1>
          <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-2">Secure Staff Access</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <Mail className="absolute right-4 top-4 text-slate-400" size={20} />
            <input 
              type="email" 
              placeholder="Email Address" 
              className="w-full px-4 py-2 border rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="relative">
            <Lock className="absolute right-4 top-4 text-slate-400" size={20} />
            <input 
              type="password" 
              placeholder="Password" 
              className="w-full px-4 py-2 border rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-sm hover:bg-black transition-all shadow-xl shadow-blue-100 uppercase tracking-widest">
            Authorize Entry
          </button>
        </form>
      </div>
    </div>
  );
}