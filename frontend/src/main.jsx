import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

const stored = localStorage.getItem("afriresq-appearance") || "light";
if (stored === "auto") document.documentElement.removeAttribute("data-theme");
else document.documentElement.dataset.theme = stored === "dark" ? "dark" : "light";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
