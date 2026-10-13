import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Team from "./admin.jsx";
import "./admin.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Team />
  </StrictMode>,
);
