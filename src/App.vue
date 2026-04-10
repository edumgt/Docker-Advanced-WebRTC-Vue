<template>
  <div class="app-shell">
    <aside class="dock">
      <div class="dock__brand">
        <p class="dock__eyebrow">Realtime Workspace</p>
        <h1>WebRTC Studio</h1>
      </div>

      <div class="dock__menu">
        <button
          v-for="item in menuItems"
          :key="item.key"
          class="dock__menu-button"
          :class="{ 'is-active': activePanel === item.key }"
          @click="activePanel = item.key"
        >
          <span>{{ item.label }}</span>
          <small>{{ item.caption }}</small>
        </button>
      </div>
    </aside>

    <main class="workspace">
      <section class="hero-card">
        <div class="hero-card__header">
          <div>
            <p class="hero-card__eyebrow">Connection</p>
            <h2>Join Shared Room</h2>
          </div>
          <div class="hero-card__status" :data-state="webrtc.connectionState">
            {{ connectionLabel }}
          </div>
        </div>

        <div class="hero-card__grid">
          <label class="field">
            <span>Signal Server</span>
            <input
              v-model="signalServerUrl"
              placeholder="ws://your-signaling-host:3001"
              class="field__input"
            />
          </label>

          <label class="field">
            <span>Room ID</span>
            <input
              v-model="roomId"
              placeholder="Enter room id"
              class="field__input"
              @keyup.enter="joinCurrentRoom"
            />
          </label>
        </div>

        <div class="hero-card__actions">
          <button class="primary-button" @click="joinCurrentRoom">Join Room</button>
          <p class="hero-card__hint">Current target: {{ webrtc.signalUrl || "not set" }}</p>
        </div>

        <p v-if="webrtc.connectionError" class="hero-card__error">{{ webrtc.connectionError }}</p>
      </section>

      <section class="content-card">
        <header class="content-card__header">
          <div>
            <p class="stage-card__eyebrow">Module</p>
            <h3>{{ activePanelTitle }}</h3>
          </div>
        </header>

        <div class="content-card__body">
          <Whiteboard v-if="activePanel === 'drawing'" :webrtc="webrtc" />
          <ChatBox v-else-if="activePanel === 'chat'" :webrtc="webrtc" />
          <FileBox v-else-if="activePanel === 'files'" :webrtc="webrtc" />
          <MediaPanel
            v-else-if="activePanel === 'video' || activePanel === 'screen'"
            :webrtc="webrtc"
            :local-stream="webrtc.localStream"
            :remote-streams="webrtc.remoteStreams"
            @start-camera="webrtc.startCameraShare"
            @stop-camera="webrtc.stopCameraShare"
            @start-screen="webrtc.startScreenShare"
            @stop-screen="webrtc.stopScreenShare"
          />
          <SystemPanel v-else-if="activePanel === 'system'" :webrtc="webrtc" />
        </div>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, ref } from "vue"
import ChatBox from "./components/ChatBox.vue"
import FileBox from "./components/FileBox.vue"
import MediaPanel from "./components/MediaPanel.vue"
import SystemPanel from "./components/SystemPanel.vue"
import Whiteboard from "./components/Whiteboard.vue"
import useWebRTC from "./composables/useWebRTC"

const roomId = ref("")
const joined = ref(false)
const activePanel = ref("drawing")

const { joinRoom, webrtc } = useWebRTC(roomId, joined)
const signalServerUrl = ref(webrtc.signalUrl)

const menuItems = [
  { key: "drawing", label: "Drawing", caption: "Large whiteboard stage" },
  { key: "chat", label: "Chat", caption: "Room messaging" },
  { key: "files", label: "Files", caption: "Send and receive" },
  { key: "video", label: "Video", caption: "Camera share" },
  { key: "screen", label: "Screen", caption: "PC screen share" },
  { key: "system", label: "System", caption: "Admin and logs" },
]

const activePanelTitle = computed(() => {
  return menuItems.find(item => item.key === activePanel.value)?.label || "Module"
})

const connectionLabel = computed(() => {
  const map = {
    idle: "Idle",
    connecting: "Connecting",
    connected: "Connected",
    error: "Error",
    closed: "Closed",
  }

  return map[webrtc.connectionState] || webrtc.connectionState
})

function joinCurrentRoom() {
  joinRoom(signalServerUrl.value)
}
</script>
