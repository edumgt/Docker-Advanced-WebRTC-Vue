function getWebSocketProtocol() {
  return window.location.protocol === "https:" ? "wss" : "ws"
}

export function buildSignalUrl() {
  const envUrl = import.meta.env.VITE_SIGNAL_URL?.trim()

  if (envUrl) {
    if (envUrl.startsWith("ws://") || envUrl.startsWith("wss://")) {
      return envUrl
    }

    return `${getWebSocketProtocol()}://${envUrl}`
  }

  const host = window.location.hostname || "localhost"
  const port = import.meta.env.VITE_SIGNAL_PORT || "3001"
  return `${getWebSocketProtocol()}://${host}:${port}`
}
