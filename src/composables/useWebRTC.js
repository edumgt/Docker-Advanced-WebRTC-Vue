import { reactive } from "vue"
import { buildSignalUrl } from "../utils/signalUrl"

function logWebRTC(scope, message, details) {
  const prefix = `[WebRTC][${scope}] ${message}`

  if (details === undefined) {
    console.log(prefix)
    return
  }

  console.log(prefix, details)
}

function summarizeSdp(sessionDescription) {
  if (!sessionDescription?.sdp) {
    return { type: sessionDescription?.type || "unknown", lines: 0 }
  }

  const lines = sessionDescription.sdp.split("\n").map(line => line.trim()).filter(Boolean)
  return {
    type: sessionDescription.type,
    lines: lines.length,
    iceUfrag: lines.find(line => line.startsWith("a=ice-ufrag:")) || null,
    fingerprint: lines.find(line => line.startsWith("a=fingerprint:")) || null,
    media: lines.filter(line => line.startsWith("m=")),
  }
}

function summarizeCandidate(candidate) {
  if (!candidate?.candidate) {
    return { type: "end-of-candidates" }
  }

  const parts = candidate.candidate.split(" ")
  return {
    protocol: parts[2] || null,
    address: parts[4] || null,
    port: parts[5] || null,
    candidateType: parts[7] || null,
    sdpMid: candidate.sdpMid || null,
    sdpMLineIndex: candidate.sdpMLineIndex ?? null,
  }
}

export default function useWebRTC(roomId, joined) {
  let ws
  const signalUrl = buildSignalUrl()
  const peers = new Map()
  const chatChannels = new Map()
  const fileChannels = new Map()
  const drawChannels = new Map()

  const clientId = Math.random().toString(36).substring(2, 10)

  const webrtc = reactive({
    connectionError: "",
    connectionState: "idle",
    signalUrl,
    sendChat(msg) {
      chatChannels.forEach((ch) => {
        if (ch.readyState === "open") ch.send(msg)
      })
    },
    onChat(callback) {
      webrtc._chatHandler = callback
    },

    sendFile(file) {
      fileChannels.forEach((ch) => {
        if (ch.readyState === "open") {
          ch.send(file.name)
          file.arrayBuffer().then(buffer => ch.send(buffer))
        }
      })
    },
    onFile(callback) {
      webrtc._fileHandler = callback
    },

    broadcastDraw(data) {
      drawChannels.forEach(ch => {
        if (ch.readyState === "open") ch.send(JSON.stringify(data))
      })
    },
    onDraw(callback) {
      webrtc._drawHandler = callback
    }
  })

  function joinRoom() {
    webrtc.connectionError = ""
    webrtc.connectionState = "connecting"
    logWebRTC("signal", "opening WebSocket", { signalUrl, roomId: roomId.value, clientId })
    ws = new WebSocket(signalUrl)

    ws.onopen = () => {
      logWebRTC("signal", "WebSocket connected", { signalUrl, readyState: ws.readyState })
      ws.send(JSON.stringify({ type: "join-room", roomId: roomId.value, sender: clientId }))
      logWebRTC("signal", "join-room sent", { roomId: roomId.value, sender: clientId })
      joined.value = true
      webrtc.connectionState = "connected"
    }

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data)
      if (data.sender === clientId) return
      logWebRTC("signal", "message received", {
        type: data.type,
        roomId: data.roomId,
        sender: data.sender,
      })
      const pc = peers.get(data.sender) || createPeer(data.sender)

      if (data.type === "new-peer") {
        logWebRTC("signal", "new peer discovered", { remoteId: data.sender })
        connectToPeer(data.sender)
      } else if (data.type === "offer") {
        logWebRTC("sdp", "remote offer received", summarizeSdp(data))
        await pc.setRemoteDescription(new RTCSessionDescription(data))
        logWebRTC("peer", "remote description applied", {
          remoteId: data.sender,
          signalingState: pc.signalingState,
        })
        const answer = await pc.createAnswer()
        logWebRTC("sdp", "local answer created", summarizeSdp(answer))
        await pc.setLocalDescription(answer)
        logWebRTC("peer", "local description applied", {
          remoteId: data.sender,
          signalingState: pc.signalingState,
        })
        ws.send(JSON.stringify({ ...answer, type: "answer", roomId: roomId.value, sender: clientId }))
        logWebRTC("signal", "answer sent", { remoteId: data.sender, roomId: roomId.value })
      } else if (data.type === "answer") {
        if (pc.signalingState === "have-local-offer") {
          logWebRTC("sdp", "remote answer received", summarizeSdp(data))
          await pc.setRemoteDescription(new RTCSessionDescription(data))
          logWebRTC("peer", "remote answer applied", {
            remoteId: data.sender,
            signalingState: pc.signalingState,
          })
        }
      } else if (data.type === "candidate" && data.candidate) {
        logWebRTC("ice", "remote ICE candidate received", summarizeCandidate(data.candidate))
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
        logWebRTC("ice", "remote ICE candidate applied", { remoteId: data.sender })
      }
    }

    ws.onerror = () => {
      joined.value = false
      webrtc.connectionState = "error"
      webrtc.connectionError = `WebSocket connection failed: ${signalUrl}`
      logWebRTC("signal", "WebSocket error", { signalUrl, readyState: ws.readyState })
    }

    ws.onclose = (event) => {
      if (webrtc.connectionState !== "error") {
        webrtc.connectionState = "closed"
      }
      logWebRTC("signal", "WebSocket closed", {
        code: event.code,
        reason: event.reason || "",
        wasClean: event.wasClean,
      })
    }
  }

  function createPeer(remoteId) {
    const pc = new RTCPeerConnection()
    peers.set(remoteId, pc)
    logWebRTC("peer", "RTCPeerConnection created", {
      remoteId,
      signalingState: pc.signalingState,
      iceGatheringState: pc.iceGatheringState,
      iceConnectionState: pc.iceConnectionState,
      connectionState: pc.connectionState,
    })

    pc.onicegatheringstatechange = () => {
      logWebRTC("ice", "ICE gathering state changed", {
        remoteId,
        iceGatheringState: pc.iceGatheringState,
      })
    }

    pc.oniceconnectionstatechange = () => {
      logWebRTC("ice", "ICE connection state changed", {
        remoteId,
        iceConnectionState: pc.iceConnectionState,
      })
    }

    pc.onconnectionstatechange = () => {
      logWebRTC("peer", "peer connection state changed", {
        remoteId,
        connectionState: pc.connectionState,
      })
    }

    pc.onsignalingstatechange = () => {
      logWebRTC("sdp", "signaling state changed", {
        remoteId,
        signalingState: pc.signalingState,
      })
    }

    pc.ondatachannel = (event) => {
      logWebRTC("datachannel", "remote data channel received", {
        remoteId,
        label: event.channel.label,
        readyState: event.channel.readyState,
      })
      if (event.channel.label === "chat") {
        chatChannels.set(remoteId, event.channel)
        event.channel.onmessage = (e) => webrtc._chatHandler?.(e.data)
      } else if (event.channel.label === "file") {
        fileChannels.set(remoteId, event.channel)
        setupFileChannel(remoteId, event.channel)
      } else if (event.channel.label === "draw") {
        drawChannels.set(remoteId, event.channel)
        event.channel.onmessage = (e) => webrtc._drawHandler?.(JSON.parse(e.data))
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        logWebRTC("ice", "local ICE candidate generated", summarizeCandidate(event.candidate))
        ws.send(JSON.stringify({
          type: "candidate",
          candidate: event.candidate,
          roomId: roomId.value,
          sender: clientId
        }))
        logWebRTC("signal", "ICE candidate sent", { remoteId, roomId: roomId.value })
      } else {
        logWebRTC("ice", "ICE candidate gathering complete", { remoteId })
      }
    }

    return pc
  }

  async function connectToPeer(remoteId) {
    const pc = createPeer(remoteId)

    const chatChannel = pc.createDataChannel("chat")
    const fileChannel = pc.createDataChannel("file")
    const drawChannel = pc.createDataChannel("draw")
    logWebRTC("datachannel", "local data channels created", {
      remoteId,
      labels: [chatChannel.label, fileChannel.label, drawChannel.label],
    })

    chatChannels.set(remoteId, chatChannel)
    fileChannels.set(remoteId, fileChannel)
    drawChannels.set(remoteId, drawChannel)

    chatChannel.onmessage = (e) => webrtc._chatHandler?.(e.data)
    setupFileChannel(remoteId, fileChannel)
    drawChannel.onmessage = (e) => webrtc._drawHandler?.(JSON.parse(e.data))

    const offer = await pc.createOffer()
    logWebRTC("sdp", "local offer created", summarizeSdp(offer))
    await pc.setLocalDescription(offer)
    logWebRTC("peer", "local offer applied", {
      remoteId,
      signalingState: pc.signalingState,
    })
    ws.send(JSON.stringify({ ...offer, type: "offer", roomId: roomId.value, sender: clientId }))
    logWebRTC("signal", "offer sent", { remoteId, roomId: roomId.value })
  }

  function setupFileChannel(remoteId, channel) {
    let buffer = []
    let fileName = ""
    channel.onmessage = (event) => {
      if (typeof event.data === "string") {
        fileName = event.data
      } else {
        buffer.push(event.data)
        const file = new Blob(buffer)
        const url = URL.createObjectURL(file)
        webrtc._fileHandler?.({ name: fileName, url })
        buffer = []
      }
    }
  }

  return { joinRoom, webrtc }
}
