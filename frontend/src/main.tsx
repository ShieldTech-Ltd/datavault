import "./index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { WalletProvider } from "./lib/wallet";

const Preview = import.meta.env.DEV && window.location.pathname.startsWith("/preview")
  ? React.lazy(() => import("./demo/ContributorPreview"))
  : null;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WalletProvider>
      {Preview ? (
        <React.Suspense fallback={<p>Loading local preview...</p>}>
          <Preview />
        </React.Suspense>
      ) : <App />}
    </WalletProvider>
  </React.StrictMode>,
);
