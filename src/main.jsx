import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { applyTheme } from "./theme";

applyTheme();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
