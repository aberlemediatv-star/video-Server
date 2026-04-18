import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import shaka from "shaka-player";
import "./index.css";
import App from "./App.tsx";

shaka.polyfill.installAll();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
