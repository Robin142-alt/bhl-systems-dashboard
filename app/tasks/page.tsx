"use client";
import { useState } from "react";
import { CheckCircle, Clock, Plus } from "lucide-react";

export default function TasksDashboard() {
  // 1. Our memory box for the list of tasks
  const [tasks, setTasks] = useState([
    { id: 1, title: "Submit NSSF Returns", deadline: "2026-04-15", status: "Pending", responsible: "Accountant" },
    { id: 2, title: "Update CR12 Records", deadline: "2026-05-01", status: "Completed", responsible: "Admin" },
    { id: 3, title: "File SHA Deductions", deadline: "2026-04-09", status: "Pending", responsible: "HR" }
  ]);

  // ⭐ NEW: 2. Our memory box for what the user is typing in the form right now
  const [formData, setFormData] = useState({
    title: "",
    deadline: "",
    responsible: "Admin" // Default choice
  });

  // ⭐ NEW: 3. The action that happens when we click "Add Task"
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); // This stops the page from refreshing (which is what forms usually do by mistake)
    
    // Create a new task "sticky note"
    const newTask = {
      id: tasks.length + 1, // Just gives it a new ID number
      title: formData.title,
      deadline: formData.deadline,
      status: "Pending", // All new tasks start as pending!
      responsible: formData.responsible
    };

    // Add the new task to our list of tasks
    setTasks([...tasks, newTask]);

    // Clear the form so it's blank for the next one
    setFormData({ title: "", deadline: "", responsible: "Admin" });
  };

  return (
    <div className="p-8 max-w-6xl mx-auto font-sans bg-gray-50 min-h-screen">
      
      {/* HEADER */}
      <div className="mb-8 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <h1 className="text-2xl font-black text-blue-900 uppercase tracking-tighter">
          BHL Compliance Dashboard
        </h1>
        <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest mt-1">
          Track Deadlines & Responsibilities
        </p>
      </div>

      {/* ⭐ NEW: ADD TASK FORM */}
      <section className="mb-10 bg-white p-8 shadow-sm rounded-[2rem] border border-gray-100">
        <h2 className="text-lg font-black mb-6 flex items-center gap-2">
          <Plus size={20} className="text-blue-600"/> Assign New Task
        </h2>
        
        {/* The Form */}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Task Title Input */}
          <div className="space-y-1 md:col-span-1">
            <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Task Title</label>
            <input 
              type="text" 
              required 
              placeholder="e.g. Renew Fire License"
              className="w-full border-2 border-gray-50 bg-gray-50 p-3 rounded-2xl outline-none focus:border-blue-500 transition-all text-sm font-bold"
              value={formData.title} 
              onChange={(e) => setFormData({...formData, title: e.target.value})} 
            />
          </div>

          {/* Deadline Input */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Deadline</label>
            <input 
              type="date" 
              required 
              className="w-full border-2 border-gray-50 bg-gray-50 p-3 rounded-2xl outline-none focus:border-blue-500 transition-all text-sm font-bold text-gray-600"
              value={formData.deadline} 
              onChange={(e) => setFormData({...formData, deadline: e.target.value})} 
            />
          </div>

          {/* Responsible Person Dropdown */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase text-gray-400 ml-2">Assign To</label>
            <select 
              className="w-full border-2 border-gray-50 bg-gray-50 p-3 rounded-2xl outline-none focus:border-blue-500 transition-all text-sm font-bold text-gray-700"
              value={formData.responsible}
              onChange={(e) => setFormData({...formData, responsible: e.target.value})}
            >
              <option value="Admin">Admin</option>
              <option value="Accountant">Accountant</option>
              <option value="HR">HR</option>
              <option value="Operations Manager">Operations Manager</option>
            </select>
          </div>

          {/* Submit Button */}
          <button className="md:col-span-3 bg-slate-900 text-white py-4 rounded-2xl font-black hover:bg-blue-600 transition-all shadow-lg shadow-blue-100 uppercase tracking-widest text-xs mt-2">
            Add Task to Board
          </button>
        </form>
      </section>

      {/* TASKS TABLE */}
      <div className="bg-white shadow-sm rounded-[2rem] overflow-hidden border border-gray-100">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-widest font-black text-gray-400">
              <th className="p-6">Task Title</th>
              <th className="p-6">Deadline</th>
              <th className="p-6">Status</th>
              <th className="p-6">Responsible</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                <td className="p-6 font-bold text-slate-800">{task.title}</td>
                <td className="p-6 text-sm font-medium text-gray-600">{task.deadline}</td>
                <td className="p-6">
                  {task.status === "Completed" ? (
                    <span className="flex items-center gap-1 w-fit bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-xs font-black uppercase">
                      <CheckCircle size={14} /> Done
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 w-fit bg-orange-50 text-orange-600 px-3 py-1 rounded-full text-xs font-black uppercase">
                      <Clock size={14} /> Pending
                    </span>
                  )}
                </td>
                <td className="p-6 text-sm font-bold text-blue-600">{task.responsible}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}