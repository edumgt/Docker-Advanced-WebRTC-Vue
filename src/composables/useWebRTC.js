import { reactive } from "vue"

export default function useWebRTC(roomId, joined) {
  let ws
  let peers = new Map()
  let chatChannels = new Map()
  let fileChannels = new Map()
  let drawChannels = new Map()

  const clientId = Math.random().toString(36).substring(2, 10)

  const webrtc = reactive({
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
    ws = new WebSocket("ws://localhost:3001")
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join-room", roomId: roomId.value, sender: clientId }))
      joined.value = true
    }

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data)
      if (data.sender === clientId) return
      const pc = peers.get(data.sender) || createPeer(data.sender)

      if (data.type === "new-peer") {
        connectToPeer(data.sender)
      } else if (data.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        ws.send(JSON.stringify({ ...answer, type: "answer", roomId: roomId.value, sender: clientId }))
      } else if (data.type === "answer") {
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(data))
        }
      } else if (data.type === "candidate" && data.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
      }
    }
  }

  function createPeer(remoteId) {
    const pc = new RTCPeerConnection()
    peers.set(remoteId, pc)

    pc.ondatachannel = (event) => {
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
        ws.send(JSON.stringify({
          type: "candidate",
          candidate: event.candidate,
          roomId: roomId.value,
          sender: clientId
        }))
      }
    }

    return pc
  }

  async function connectToPeer(remoteId) {
    const pc = createPeer(remoteId)

    const chatChannel = pc.createDataChannel("chat")
    const fileChannel = pc.createDataChannel("file")
    const drawChannel = pc.createDataChannel("draw")

    chatChannels.set(remoteId, chatChannel)
    fileChannels.set(remoteId, fileChannel)
    drawChannels.set(remoteId, drawChannel)

    chatChannel.onmessage = (e) => webrtc._chatHandler?.(e.data)
    setupFileChannel(remoteId, fileChannel)
    drawChannel.onmessage = (e) => webrtc._drawHandler?.(JSON.parse(e.data))

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    ws.send(JSON.stringify({ ...offer, type: "offer", roomId: roomId.value, sender: clientId }))
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
