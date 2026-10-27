import { useEffect, useState } from "react";
import { fetch } from "@tauri-apps/plugin-http";
import { info, error, warn } from "@tauri-apps/plugin-log";
import "./App.css";
import { invoke } from "@tauri-apps/api/core";
import { Box } from "@mui/material";
const CANDIDATE_PORTS = [8000, 19119];
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serverUrl(port) {
  return `http://127.0.0.1:${port}`;
}

function appUrl(port) {
  return `${serverUrl(port)}/clients/tc-check/`;
}

async function checkPort(port) {
  const url = serverUrl(port);
  try {
    await info(`Checking server: ${url}`);

    const response = await fetch(url, {
      method: "GET",
      maxRedirections: 0,
    });
    console.log(response);
    await info(`SERVER RESPONSE (${port}): ${response.status}`);

    if (
      response.status === 200 ||
      response.status === 301 ||
      response.status === 302 ||
      response.status === 303
    ) {
      return true;
    }

    await warn(`Unexpected server response (${port}): ${response.status}`);
    return false;
  } catch (err) {
    await warn(`Server not ready (${port}): ${String(err)}`);
    return false;
  }
}

function App() {
  const [status, setStatus] = useState("connecting");
  const [cancelled, setCancelled] = useState(false);
  const [state, setState] = useState("nothing...");
  const [target, setTarget] = useState(null);
  console.log(state);

  async function start(opts = {}) {
    const {
      overallTimeoutMs = 20000,
      perRequestTimeoutMs = 1000,
      intervalMs = 1000,
    } = opts;

    console.log("start() called");

    try {
      const readyPort = await invoke("wait_for_server", {
        candidatePorts: CANDIDATE_PORTS,
        overallTimeoutMs,
        perRequestTimeoutMs,
        intervalMs,
      });

      if (readyPort === null || cancelled) {
        await warn("Startup cancelled");
        return;
      }

      const targetInApp = appUrl(readyPort);
      await info(`Opening app: ${targetInApp}`);

      if (!cancelled) {

        window.location.href = targetInApp;

        setTarget(targetInApp);
        setStatus("connected");
        return true;
      }
    } catch (err) {
      await error(`Startup error: ${String(err)}`);
      setStatus("error");
    }
  }
  useEffect(() => {
    start();
  }, []);
  if (target) {
    return (
      <Box
        sx={{
          marginTop: "env(safe-area-inset-top)",
          marginBottom: "env(safe-area-inset-bottom)",
          marginLeft: "env(safe-area-inset-left)",
          marginRight: "env(safe-area-inset-right)",
          height:
            "calc(100dvh - env(safe-area-inset-bottom) - env(safe-area-inset-top))",
          width:
            "calc(100dvw - env(safe-area-inset-left) - env(safe-area-inset-right))",
        }}
      >
        <iframe
          src={target}
          title="Application"
          style={{ height: "100%", width: "100%", border: "none" }}
        />
      </Box>
    );
  }
  if (status === "error") {
    return (
      <div style={splashStyle}>
        <img src="/favicon.svg" style={logoStyle} />
        <p style={textStyle}>Couldn't connect to the local server.</p>
      </div>
    );
  }

  return (
    <div style={splashStyle}>
      <img src="/noBg.svg" style={logoStyle} />
      <p style={textStyle}>
        {status === "connecting"
          ? `Waiting for app to load... ${state}`
          : "Opening app..."}
      </p>
    </div>
  );
}

const splashStyle = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  width: "100%",
  backgroundColor: "#21A0A0",
  color: "white",
  fontFamily: "sans-serif",
};
const logoStyle = {
  width: "180px",
  height: "180px",
  objectFit: "contain",
  marginBottom: "24px",
};

const textStyle = {
  fontSize: "16px",
  opacity: 0.85,
};

export default App;
