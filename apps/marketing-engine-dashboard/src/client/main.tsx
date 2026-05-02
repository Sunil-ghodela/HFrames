import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

ensureToken();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

function ensureToken(): void {
  if (localStorage.getItem("jwt")) return;
  const token = window.prompt("Paste a CraftLee JWT (admin user) to use the marketing dashboard:");
  if (token && token.trim()) {
    localStorage.setItem("jwt", token.trim());
  }
}
