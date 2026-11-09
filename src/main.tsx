import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { I18nProvider } from "./i18n/index.tsx";
import { ScoreProvider } from "./data/store.tsx";
import { App } from "./App.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <ScoreProvider>
          <App />
        </ScoreProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
