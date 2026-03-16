import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env from root directory (project root)
  // Vite automatically loads .env files, but we need to ensure it looks in the right place
  const rootDir = path.resolve(__dirname, '../..')
  const env = loadEnv(mode, rootDir, '')
  const orchFlowPort = env.ORCH_FLOW_PORT || process.env.ORCH_FLOW_PORT;
  if (!orchFlowPort) {
    throw new Error('ORCH_FLOW_PORT environment variable is required. Set it in .env file.');
  }
  const port = parseInt(orchFlowPort, 10)

  return {
    // Explicitly tell Vite where to find .env files (project root)
    // This ensures VITE_ prefixed variables are available to client code via import.meta.env
    envDir: rootDir,
    server: {
      host: "::",
      port,
      // Allow all hosts for Tailscale/remote access
      allowedHosts: true,
      hmr: {
        // For remote access (Tailscale/LAN), let the browser determine the host
        // Setting host to false allows the client to connect to the same host as the page
        protocol: 'ws'
      }
    },
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
});
