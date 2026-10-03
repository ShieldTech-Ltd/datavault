import React from "react";
import ReactDOM from "react-dom/client";
import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import App from "./App";
import { dynamicEnvironmentId, monadTestnet } from "./lib/dynamic";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DynamicContextProvider
      settings={{
        environmentId: dynamicEnvironmentId,
        walletConnectors: [EthereumWalletConnectors],
        overrides: {
          evmNetworks: [monadTestnet],
        },
      }}
    >
      <App />
    </DynamicContextProvider>
  </React.StrictMode>,
);
