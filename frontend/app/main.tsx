import "maplibre-gl/dist/maplibre-gl.css";
import "./app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { client } from "./client/client.gen";
import HomePage from "./routes/index";

client.setConfig({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000",
});

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <HomePage />
  </StrictMode>
);
