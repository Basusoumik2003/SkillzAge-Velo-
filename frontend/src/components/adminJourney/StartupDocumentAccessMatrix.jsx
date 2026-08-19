"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import {
  getAdminStartupDocumentAccess,
  updateAdminStartupDocumentAccess
} from "@/lib/startup";

export default function StartupDocumentAccessMatrix() {
  const [agents, setAgents] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [checked, setChecked] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMatrix();
  }, []);

  async function loadMatrix() {
    const data = await getAdminStartupDocumentAccess();

    setAgents(data.agents || []);
    setDocuments(data.documents || []);

    const selected = new Set(
      (data.rules || []).map(
        (rule) =>
          `${rule.agent_id}:${rule.document_kind}:${rule.document_id}`
      )
    );

    setChecked(selected);
  }

  function toggleAccess(agentId, document) {
    const key =
      `${agentId}:${document.document_kind}:${document.id}`;

    setChecked((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  async function saveAccess() {
    setSaving(true);

    const rules = [...checked].map((key) => {
      const [agent_id, document_kind, document_id] =
        key.split(":");

      return {
        agent_id: Number(agent_id),
        document_kind,
        document_id: Number(document_id)
      };
    });

    await updateAdminStartupDocumentAccess(rules);

    setSaving(false);
    alert("Document access saved.");
  }

  return (
    <section className="mt-8 rounded-3xl border bg-white p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black">
            Document access matrix
          </h2>

          <p className="text-sm text-slate-500">
            Select which agents can access each document.
          </p>
        </div>

        <button
          type="button"
          onClick={saveAccess}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white"
        >
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save access"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="min-w-64 px-4 py-4 text-left">
                Documents
              </th>

              {agents.map((agent) => (
                <th
                  key={agent.id}
                  className="min-w-32 px-4 py-4 text-center"
                >
                  {agent.mentor_name}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {documents.map((document) => (
              <tr
                key={`${document.document_kind}:${document.id}`}
                className="border-t"
              >
                <td className="px-4 py-4">
                  <div className="font-bold">
                    {document.title}
                  </div>

                  <div className="text-xs text-slate-500">
                    {document.document_kind === "stage"
                      ? "Stage document"
                      : "Global source"}
                  </div>
                </td>

                {agents.map((agent) => {
                  const key =
                    `${agent.id}:${document.document_kind}:${document.id}`;

                  return (
                    <td
                      key={agent.id}
                      className="px-4 py-4 text-center"
                    >
                      <input
                        type="checkbox"
                        checked={checked.has(key)}
                        onChange={() =>
                          toggleAccess(agent.id, document)
                        }
                        className="h-4 w-4 accent-orange-500"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}