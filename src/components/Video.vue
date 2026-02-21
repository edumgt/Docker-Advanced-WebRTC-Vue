<template>
  <div class="p-6 flex flex-col space-y-4 bg-gray-100 min-h-screen">
    <!-- 방 참여 -->
    <div class="flex space-x-2 justify-center">
      <input v-model="roomId" placeholder="Room ID 입력"
             class="border px-2 py-1 rounded w-40"/>
      <button @click="joinRoom" class="px-4 py-2 bg-blue-500 text-white rounded">🚪 Join Room</button>
    </div>

    <!-- 화이트보드 -->
    <div class="flex justify-center">
      <canvas ref="board" width="600" height="400"
              class="border bg-white"
              @mousedown="startDraw" 
              @mousemove="drawing" 
              @mouseup="endDraw" 
              @mouseleave="endDraw">
      </canvas>
    </div>

    <!-- 채팅 & 파일 -->
    <div class="flex space-x-6 justify-center" v-if="joined">
      <!-- 채팅 -->
      <div class="border p-3 rounded w-96 bg-white shadow">
        <h3 class="font-bold mb-2">💬 Chat (Room: {{ roomId }})</h3>
        <div class="h-40 overflow-y-auto border p-2 mb-2 bg-gray-50" ref="chatBox">
          <div v-for="(msg, i) in messages" :key="i" class="text-sm">
            {{ msg }}
          </div>
        </div>
        <input v-model="chatInput" @keyup.enter="sendChat"
               placeholder="메시지 입력"
               class="border px-2 py-1 w-full rounded" />
      </div>

      <!-- 파일 전송 -->
      <div class="border p-3 rounded w-96 bg-white shadow">
        <h3 class="font-bold mb-2">📂 File Transfer</h3>
        <input type="file" @change="sendFile" class="mb-2"/>
        <ul>
          <li v-for="(file, i) in receivedFiles" :key="i">
            <a :href="file.url" :download="file.name" class="text-blue-600 underline">
              {{ file.name }}
            </a>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from "vue"

// --- WebRTC state ---
let ws
let peers = new Map()
let chatChannels = new Map()
let fileChannels = new Map()
let drawChannels = new Map()

const clientId = Math.random().toString(36).substring(2, 10)
const roomId = ref("")
const joined = ref(false)

const chatBox = ref(null)
const messages = ref([])
const chatInput = ref("")
const receivedFiles = ref([])

// --- Canvas state ---
const board = ref(null)
let ctx, drawingFlag = false

onMounted(() => {
  ctx = board.value.getContext("2d")
  ctx.lineWidth = 2
  ctx.strokeStyle = "black"
})

// 🎨 Canvas local draw
function startDraw(e) {
  drawingFlag = true
  ctx.beginPath()
  ctx.moveTo(e.offsetX, e.offsetY)

  broadcastDraw({ type: "start", x: e.offsetX, y: e.offsetY })
}

function drawing(e) {
  if (!drawingFlag) return
  ctx.lineTo(e.offsetX, e.offsetY)
  ctx.stroke()

  broadcastDraw({ type: "draw", x: e.offsetX, y: e.offsetY })
}

function endDraw() {
  if (!drawingFlag) return
  drawingFlag = false
  broadcastDraw({ type: "end" })
}

// 🎨 Send draw events
function broadcastDraw(data) {
  drawChannels.forEach(ch => {
    if (ch.readyState === "open") {
      ch.send(JSON.stringify(data))
    }
  })
}

// 🎨 Apply remote draw events
function applyRemoteDraw(data) {
  if (data.type === "start") {
    ctx.beginPath()
    ctx.moveTo(data.x, data.y)
  } else if (data.type === "draw") {
    ctx.lineTo(data.x, data.y)
    ctx.stroke()
  } else if (data.type === "end") {
    ctx.closePath()
  }
}

// --- WebSocket / Signaling ---
function joinRoom() {
  ws = new WebSocket("ws://localhost:3001")

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "join-room", roomId: roomId.value, sender: clientId }))
    joined.value = true
  }

  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data)
    if (data.sender === clientId) return // 내가 보낸 건 무시

    const pc = peers.get(data.sender) || createPeer(data.sender)

    try {
      if (data.type === "new-peer") {
        console.log("새 피어 발견:", data.sender)
        connectToPeer(data.sender)

      } else if (data.type === "offer") {
        if (pc.signalingState !== "stable") {
          console.warn("⚠️ Offer 수신했지만 상태가 stable이 아님:", pc.signalingState)
        }
        await pc.setRemoteDescription(new RTCSessionDescription(data))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        ws.send(JSON.stringify({ ...answer, type: "answer", roomId: roomId.value, sender: clientId }))

      } else if (data.type === "answer") {
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(data))
        } else {
          console.log("⚠️ 잘못된 상태에서 answer 수신:", pc.signalingState)
        }

      } else if (data.type === "candidate" && data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
        } catch (err) {
          console.warn("ICE candidate 추가 실패:", err)
        }
      }
    } catch (err) {
      console.error("❌ signaling error:", err)
    }
  }
}

// --- Peer 생성 ---
function createPeer(remoteId) {
  const pc = new RTCPeerConnection()
  peers.set(remoteId, pc)

  pc.ondatachannel = (event) => {
    if (event.channel.label === "chat") {
      chatChannels.set(remoteId, event.channel)
      setupChatChannel(event.channel)
    } else if (event.channel.label === "file") {
      fileChannels.set(remoteId, event.channel)
      setupFileChannel(event.channel)
    } else if (event.channel.label === "draw") {
      drawChannels.set(remoteId, event.channel)
      setupDrawChannel(event.channel)
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

// --- Peer 연결 (Offer 발행) ---
async function connectToPeer(remoteId) {
  const pc = createPeer(remoteId)

  const chatChannel = pc.createDataChannel("chat")
  const fileChannel = pc.createDataChannel("file")
  const drawChannel = pc.createDataChannel("draw")

  chatChannels.set(remoteId, chatChannel)
  fileChannels.set(remoteId, fileChannel)
  drawChannels.set(remoteId, drawChannel)

  setupChatChannel(chatChannel)
  setupFileChannel(fileChannel)
  setupDrawChannel(drawChannel)

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  ws.send(JSON.stringify({ ...offer, type: "offer", roomId: roomId.value, sender: clientId }))
}

// --- 채널 핸들러 ---
function setupChatChannel(channel) {
  channel.onmessage = (e) => {
    messages.value.push(`상대방: ${e.data}`)
    nextTick(() => {
      if (chatBox.value) {
        chatBox.value.scrollTop = chatBox.value.scrollHeight
      }
    })
  }
}

function setupFileChannel(channel) {
  let receivedBuffer = []
  let fileName = ""

  channel.onmessage = (event) => {
    if (typeof event.data === "string") {
      fileName = event.data
    } else {
      receivedBuffer.push(event.data)
      const file = new Blob(receivedBuffer)
      const url = URL.createObjectURL(file)
      receivedFiles.value.push({ name: fileName, url })
      receivedBuffer = []
    }
  }
}

function setupDrawChannel(channel) {
  channel.onmessage = (e) => {
    const data = JSON.parse(e.data)
    applyRemoteDraw(data)
  }
}

// --- 채팅 & 파일 전송 ---
function sendChat() {
  if (!chatInput.value) return
  messages.value.push(`나: ${chatInput.value}`)
  chatChannels.forEach((ch) => {
    if (ch.readyState === "open") ch.send(chatInput.value)
  })
  chatInput.value = ""
}

function sendFile(event) {
  const file = event.target.files[0]
  if (!file) return
  fileChannels.forEach((ch) => {
    if (ch.readyState === "open") {
      ch.send(file.name)
      file.arrayBuffer().then(buffer => ch.send(buffer))
    }
  })
}
</script>
