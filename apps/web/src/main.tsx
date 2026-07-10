import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/soft-ui.css";
// Portal surfaces (task 8.1). Built on the existing tokens/base/soft-ui above.
import "./styles/portal.css";
import "./styles/home.css";
import "./styles/article.css";
import "./styles/compose.css";
import "./styles/topics.css";
import "./styles/people.css";
import { App } from "./App.js";
import { queryClient } from "./state/queryClient.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
