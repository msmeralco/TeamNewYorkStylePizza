import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/noto-sans/400.css";
import "@fontsource/noto-sans/700.css";
import "@fontsource/fira-sans/500.css";
import "@fontsource/fira-sans/600.css";
import "@fontsource/fira-sans/700.css";
import "@fontsource/fira-sans/800.css";
import "@fontsource/caveat/500.css";
import "./styles.css";
import App from "./App";

if (import.meta.env.DEV) import("./debug").then((m) => Object.assign(window, { __lab: m }));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
