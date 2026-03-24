import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("No #root element found");

createRoot(rootEl).render(
  <StrictMode>
    <div>MCP Chat</div>
  </StrictMode>
);
