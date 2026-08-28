import React from "react";
import ReactDOM from "react-dom/client";
// Aliased: `Analytics` already means the ledger's own analytics view.
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import App from "./App.jsx";
import { applyTheme } from "./theme";

applyTheme();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
    <VercelAnalytics />
  </React.StrictMode>
);
