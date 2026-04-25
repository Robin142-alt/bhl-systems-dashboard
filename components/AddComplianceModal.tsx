"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createComplianceItem } from "@/app/actions";
import { SubmitButton } from "./SubmitButton";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void>;
}

interface AssignableUser {
  id: number;
  name: string | null;
  email: string;
  role: string;
}

export default function AddComplianceModal({ isOpen, onClose, onSuccess }: Props) {
  const [users, setUsers] = useState<AssignableUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let active = true;

    const loadUsers = async () => {
      setLoadingUsers(true);

      try {
        const response = await fetch("/api/users");
        const data = (await response.json()) as AssignableUser[];

        if (active && response.ok) {
          setUsers(data);
        }
      } catch (error) {
        console.error("[add-compliance-modal] Failed to load users:", error);
      } finally {
        if (active) {
          setLoadingUsers(false);
        }
      }
    };

    void loadUsers();

    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-6">
          <div>
            <h2 className="text-lg font-bold text-slate-800">New Compliance Requirement</h2>
            <p className="text-sm text-slate-500">Assign it to a real owner and let the checklist drive completion.</p>
          </div>
          <button
            onClick={onClose}
            className="text-2xl text-slate-400 transition-colors hover:text-slate-600"
          >
            &times;
          </button>
        </div>

        <form
          action={async (formData: FormData) => {
            try {
              await createComplianceItem(formData);
              await onSuccess();
              toast.success("Requirement saved and assigned.");
              onClose();
            } catch {
              toast.error("Cloud sync failed. Please try again.");
            }
          }}
          className="grid gap-5 p-6 md:grid-cols-2"
        >
          <div className="md:col-span-2">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Requirement Name
            </label>
            <input
              name="title"
              required
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none transition focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. KRA VAT Filing"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Deadline
            </label>
            <input
              name="deadline"
              required
              type="date"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Category
            </label>
            <select
              name="category"
              defaultValue="Tax"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Tax">Tax</option>
              <option value="Statutory">Statutory</option>
              <option value="Legal">Legal</option>
              <option value="Certification">Certification</option>
              <option value="Permit">Permit</option>
              <option value="Operations">Operations</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Assign To
            </label>
            <select
              name="userId"
              defaultValue={users[0]?.id ?? ""}
              disabled={loadingUsers || users.length === 0}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name || user.email} ({user.role.replaceAll("_", " ")})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Frequency
            </label>
            <select
              name="frequency"
              defaultValue="Monthly"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
              <option value="Bi-Annual">Bi-Annual</option>
              <option value="Annual">Annual</option>
              <option value="One-Off">One-Off</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Reminder Days
            </label>
            <input
              name="remindDaysBefore"
              type="number"
              min={1}
              defaultValue={7}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Client / Entity
            </label>
            <input
              name="clientName"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none transition focus:ring-2 focus:ring-blue-500"
              placeholder="Optional: BHL Interiors Ltd"
            />
          </div>

          <div className="md:col-span-2 pt-2">
            <SubmitButton />
            <button
              type="button"
              onClick={onClose}
              className="mt-3 w-full py-3 text-sm font-bold text-slate-400 transition-colors hover:text-slate-600"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
