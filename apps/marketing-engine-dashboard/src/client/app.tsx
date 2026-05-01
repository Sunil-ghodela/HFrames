import { useEffect, useState } from "react";
import { api } from "./api.ts";
import type { TemplateListItem } from "../shared/types.ts";

export function App() {
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getTemplates()
      .then(setTemplates)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) return <div style={{ padding: 16, color: "red" }}>Error: {error}</div>;

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1>marketing-engine-dashboard</h1>
      <p>Loaded {templates.length} template(s).</p>
      <ul>
        {templates.map((t) => (
          <li key={t.schema.name}>
            {t.schema.name} — {String(t.schema.description ?? "")}
          </li>
        ))}
      </ul>
    </div>
  );
}
