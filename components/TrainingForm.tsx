"use client";

import { createTrainingItem } from "@/app/actions";
import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button 
      type="submit" 
      disabled={pending}
      className={`w-full py-2 px-4 rounded-md text-white font-semibold ${pending ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
    >
      {pending ? "Processing..." : "Register Training"}
    </button>
  );
}

export default function TrainingForm() {
  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md border border-gray-200">
      <h2 className="text-xl font-bold mb-4 text-gray-800">Schedule New Training</h2>
      
      <form action={createTrainingItem} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Course Title</label>
          <input name="title" type="text" required className="mt-1 block w-full border rounded-md p-2" placeholder="e.g. Advanced C++ Patterns" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Start Date</label>
            <input name="startDate" type="datetime-local" required className="mt-1 block w-full border rounded-md p-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Cost (KES)</label>
            <input name="costKES" type="number" required className="mt-1 block w-full border rounded-md p-2" placeholder="Max 5000" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Location</label>
          <input name="location" type="text" className="mt-1 block w-full border rounded-md p-2" placeholder="Online or Office" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Description</label>
          <textarea name="description" className="mt-1 block w-full border rounded-md p-2" rows={3}></textarea>
        </div>

        <SubmitButton />
      </form>
    </div>
  );
}