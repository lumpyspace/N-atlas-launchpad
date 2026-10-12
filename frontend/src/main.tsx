import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import PublicAssistant from "./screens/PublicAssistant.tsx";
import "./index.css";

// A published assistant (/a/<slug>) is its own page: just the chat, no Launchpad around it.
const published = window.location.pathname.match(/^\/a\/([\w-]+)(?:\/([\w-]+(?:\/[\w-]+)?))?\/?$/);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{published ? <PublicAssistant slug={published[1]} page={published[2] ?? ""} /> : <App />}</React.StrictMode>,
);
