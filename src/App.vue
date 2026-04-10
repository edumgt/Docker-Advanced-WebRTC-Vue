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
          @click="togglePanel(item.key)"
        >
          <span>{{ item.label }}</span>
          <small>{{ item.caption }}</small>
        </button>
      </div>

      <button class="dock__drawer-toggle" @click="drawerOpen = !drawerOpen">
        {{ drawerOpen ? "Close Panel" : "Open Panel" }}
      </button>
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

      <section class="stage-grid">
        <article class="stage-card stage-card--canvas">
          <div class="stage-card__header">
            <div>
              <p class="stage-card__eyebrow">Drawing</p>
              <h3>Shared Whiteboard</h3>
            </div>
            <button class="ghost-button" @click="openPanel('drawing')">Open Tools</button>
          </div>
          <Whiteboard v-if="joined" :webrtc="webrtc" />
          <div v-else class="stage-card__placeholder">
            Room에 입장하면 실시간 드로잉 영역이 활성화됩니다.
          </div>
        </article>

        <article class="stage-card stage-card--media">
          <div class="stage-card__header">
            <div>
              <p class="stage-card__eyebrow">Media</p>
              <h3>Video and Screen Streams</h3>
            </div>
            <button class="ghost-button" @click="openPanel('video')">Open Media Panel</button>
          </div>

          <MediaPanel
            :webrtc="webrtc"
            :local-stream="webrtc.localStream"
            :remote-streams="webrtc.remoteStreams"
            :compact="true"
            @start-camera="webrtc.startCameraShare"
            @stop-camera="webrtc.stopCameraShare"
            @start-screen="webrtc.startScreenShare"
            @stop-screen="webrtc.stopScreenShare"
          />
        </article>
      </section>
    </main>

    <div
      class="offcanvas-backdrop"
      :class="{ 'is-open': drawerOpen }"
      @click="drawerOpen = false"
    ></div>

    <aside class="offcanvas" :class="{ 'is-open': drawerOpen }">
      <div class="offcanvas__header">
        <div>
          <p class="offcanvas__eyebrow">Workspace Menu</p>
          <h2>{{ activePanelTitle }}</h2>
        </div>
        <button class="ghost-button" @click="drawerOpen = false">Close</button>
      </div>

      <div class="offcanvas__body">
        <section v-if="activePanel === 'drawing'" class="panel-note">
          <p>메인 화면의 화이트보드에서 바로 드로잉할 수 있습니다.</p>
          <p>원격 드로잉 데이터는 DataChannel의 `draw` 라벨로 실시간 전송됩니다.</p>
        </section>

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
      </div>
    </aside>
  </div>
</template>

<script setup>
import { computed, ref } from "vue"
import Whiteboard from "./components/Whiteboard.vue"
import ChatBox from "./components/ChatBox.vue"
import FileBox from "./components/FileBox.vue"
import MediaPanel from "./components/MediaPanel.vue"
import useWebRTC from "./composables/useWebRTC"

const roomId = ref("")
const joined = ref(false)
const drawerOpen = ref(true)
const activePanel = ref("chat")

const { joinRoom, webrtc } = useWebRTC(roomId, joined)
const signalServerUrl = ref(webrtc.signalUrl)

const menuItems = [
  { key: "drawing", label: "Drawing", caption: "Whiteboard tools" },
  { key: "chat", label: "Chat", caption: "Room messaging" },
  { key: "files", label: "Files", caption: "Send and receive" },
  { key: "video", label: "Video", caption: "Camera share" },
  { key: "screen", label: "Screen", caption: "PC screen share" },
]

const activePanelTitle = computed(() => {
  return menuItems.find(item => item.key === activePanel.value)?.label || "Panel"
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

function togglePanel(panelKey) {
  if (activePanel.value === panelKey && drawerOpen.value) {
    drawerOpen.value = false
    return
  }

  activePanel.value = panelKey
  drawerOpen.value = true
}

function openPanel(panelKey) {
  activePanel.value = panelKey
  drawerOpen.value = true
}

function joinCurrentRoom() {
  joinRoom(signalServerUrl.value)
}
</script>
