"use client";

import { useEffect, useState } from "react";
import axios from "axios";

// This tells the computer exactly what a "Compliance Item" looks like
interface ComplianceItem {
  id: number;
  title: string;
  deadline: string;
  frequency: string;
  responsible: string;
  status: string;
}

export default function ComplianceDashboard() {
  const [items, setItems] = useState<ComplianceItem[]>([]);

  useEffect(() => {
    // This drives to the API Bridge to get the data
    axios.get("/api/compliance")
      .then(res => {
        setItems(res.data);
      })
      .catch(err => {
        console.error("The bridge is broken:", err);
      });
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-blue-900 mb-6">BHL Compliance Tracker</h1>
      
      <div className="overflow-x-auto shadow-md rounded-lg">
        <table className="w-full text-left border-collapse bg-white">
          <thead className="bg-blue-50 text-blue-900">
            <tr>
              <th className="p-4 border">Obligation Title</th>
              <th className="p-4 border">Deadline</th>
              <th className="p-4 border">Frequency</th>
              <th className="p-4 border">Responsible</th>
              <th className="p-4 border">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length > 0 ? (
              items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="p-4 border font-medium">{item.title}</td>
                  <td className="p-4 border">{new Date(item.deadline).toLocaleDateString()}</td>
                  <td className="p-4 border text-sm text-gray-600">{item.frequency}</td>
                  <td className="p-4 border">{item.responsible}</td>
                  <td className="p-4 border">
                    <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-bold">
                      {item.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="p-10 text-center text-gray-400 italic">
                  Looking for BHL deadlines... (Make sure your API is running!)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}