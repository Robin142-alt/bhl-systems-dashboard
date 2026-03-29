"use client";
import { useState } from "react";

interface AttendanceRecord {
  id: number;
  staffName: string;
  certificateUrl: string;
  createdAt: string;
  training: {
    title: string;
    cost: number; // We need this to calculate the total spent
  };
}

export default function TrainingHistory() {
  const [searchName, setSearchName] = useState("");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchName) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance?name=${searchName}`);
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Search failed", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // --- NEW BRAIN: Dashboard Math ---
  // This sums up the cost of every training in the search results
  const totalSpentOnStaff = records.reduce((sum, rec) => sum + (Number(rec.training?.cost) || 0), 0);
  const totalCourses = records.length;

  return (
    <div className="p-8 max-w-6xl mx-auto min-h-screen bg-gray-50">
      
      <div className="no-print">
        <h1 className="text-4xl font-black mb-2 text-blue-900 text-center uppercase tracking-tight">
          Staff Achievement Gallery
        </h1>
        <p className="text-center text-gray-500 mb-10 font-medium">Search for a staff member to view their earned certificates.</p>

        {/* SEARCH SECTION */}
        <div className="flex gap-3 mb-10 justify-center">
          <input 
            type="text" 
            placeholder="Search Staff Name..." 
            className="border-2 border-gray-200 p-4 rounded-2xl w-80 outline-none focus:border-blue-500 shadow-sm text-lg"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
          />
          <button 
            onClick={handleSearch}
            className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black hover:bg-black shadow-lg transition-all"
          >
            {loading ? "SEARCHING..." : "FIND RECORDS"}
          </button>
        </div>

        {/* STATS DASHBOARD (Only shows if records are found) */}
        {records.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12 max-w-2xl mx-auto">
            <div className="bg-white p-6 rounded-2xl shadow-sm border-b-4 border-blue-600 text-center">
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Total Investment</p>
              <h2 className="text-2xl font-bold text-gray-800">KES {totalSpentOnStaff.toLocaleString()}</h2>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border-b-4 border-green-600 text-center">
              <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Courses Completed</p>
              <h2 className="text-2xl font-bold text-gray-800">{totalCourses} Sessions</h2>
            </div>
          </div>
        )}
      </div>

      {/* RESULTS SECTION: THE CARD GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {records.map((rec) => (
          <div key={rec.id} className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6 flex flex-col hover:shadow-2xl transition-all relative overflow-hidden print:shadow-none print:border-2 print:border-blue-900">
            
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 bg-blue-900 text-white rounded-2xl flex items-center justify-center font-bold text-2xl shadow-lg">
                {rec.staffName[0]}
              </div>
              <div>
                <h3 className="font-black text-gray-900 uppercase text-xs">BHL Staff</h3>
                <p className="text-xl font-bold text-blue-600">{rec.staffName}</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-4 mb-6 border border-dashed border-gray-200">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Course Completed</span>
              <p className="text-lg font-bold text-gray-800 mt-1 uppercase leading-tight">
                {rec.training.title}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Date: {new Date(rec.createdAt).toLocaleDateString()}
              </p>
            </div>

            <div className="flex gap-2 no-print">
              {rec.certificateUrl && (
                <a href={rec.certificateUrl} target="_blank" className="flex-1 bg-blue-900 text-white text-center py-3 rounded-xl font-black text-xs hover:bg-black transition-colors">
                  VIEW DOC 📄
                </a>
              )}
              <button 
                onClick={handlePrint}
                className="flex-1 bg-green-600 text-white py-3 rounded-xl font-black text-xs hover:bg-green-700 transition-colors"
              >
                PRINT CARD 🖨️
              </button>
            </div>
          </div>
        ))}
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .grid { display: block !important; }
          .rounded-3xl { border: 2px solid #1e3a8a !important; margin-bottom: 20px; page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}