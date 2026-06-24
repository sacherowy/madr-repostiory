import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app-shell.css";
import "./styles/folder-tree.css";
import "./styles/soft-ui.css";
import { App } from "./App.js";
import { queryClient } from "./state/queryClient.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
