<template>
  <section class="system-shell">
    <div class="system-grid">
      <article class="system-card">
        <p class="system-card__eyebrow">Room</p>
        <h3>{{ webrtc.activeRoomId || "Not joined" }}</h3>
        <p>현재 세션이 사용 중인 방 식별자입니다.</p>
      </article>

      <article class="system-card">
        <p class="system-card__eyebrow">Signal Server</p>
        <h3 class="system-card__break">{{ webrtc.signalUrl || "Not set" }}</h3>
        <p>브라우저가 현재 붙으려는 WebSocket signaling 대상입니다.</p>
      </article>

      <article class="system-card">
        <p class="system-card__eyebrow">Transport</p>
        <h3>{{ transportLabel }}</h3>
        <p>현재 접속 URL 기준으로 추정한 signaling transport 입니다.</p>
      </article>

      <article class="system-card">
        <p class="system-card__eyebrow">Peers</p>
        <h3>{{ webrtc.peerCount }}</h3>
        <p>활성 RTCPeerConnection 수와 원격 스트림 상태를 추적합니다.</p>
      </article>
    </div>

    <div class="system-analysis">
      <article class="system-panel">
        <div class="system-panel__header">
          <div>
            <p class="system-card__eyebrow">Signal Usage</p>
            <h3>Runtime Status</h3>
          </div>
          <span class="system-badge" :data-state="webrtc.connectionState">{{ webrtc.connectionState }}</span>
        </div>
        <ul class="system-list">
          <li>Connection: {{ webrtc.connectionState }}</li>
          <li>Remote Streams: {{ webrtc.remoteStreams.length }}</li>
          <li>Recent Logs: {{ webrtc.eventLogs.length }}</li>
          <li>Signal Protocol: {{ transportLabel }}</li>
        </ul>
      </article>

      <article class="system-panel">
        <div class="system-panel__header">
          <div>
            <p class="system-card__eyebrow">CloudWatch Analysis</p>
            <h3>Admin Insight</h3>
          </div>
        </div>
        <ul class="system-list">
          <li>{{ analysis.summary }}</li>
          <li>{{ analysis.signal }}</li>
          <li>{{ analysis.ice }}</li>
          <li>{{ analysis.sdp }}</li>
        </ul>
        <p class="system-panel__hint">
          이 화면은 프런트에서 수집한 WebRTC 이벤트를 기반으로 CloudWatch 점검 포인트를 요약합니다.
        </p>
      </article>
    </div>

    <article class="system-panel">
      <div class="system-panel__header">
        <div>
          <p class="system-card__eyebrow">Event Stream</p>
          <h3>Recent WebRTC Logs</h3>
        </div>
      </div>
      <div class="log-table">
        <div v-for="entry in webrtc.eventLogs" :key="entry.id" class="log-row">
          <span class="log-row__scope">{{ entry.scope }}</span>
          <div class="log-row__body">
            <strong>{{ entry.message }}</strong>
            <p>{{ entry.createdAt }}</p>
            <pre v-if="entry.details">{{ JSON.stringify(entry.details, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </article>
  </section>
</template>

<script setup>
import { computed } from "vue"

const props = defineProps({
  webrtc: { type: Object, required: true },
})

const transportLabel = computed(() => {
  if (props.webrtc.signalUrl?.startsWith("wss://")) return "WSS / 443-style secure WebSocket"
  if (props.webrtc.signalUrl?.startsWith("ws://")) return "WS / explicit WebSocket"
  return "Unknown"
})

const analysis = computed(() => {
  const logs = props.webrtc.eventLogs || []
  const hasSignalOpen = logs.some(entry => entry.message.includes("WebSocket connected"))
  const hasOffer = logs.some(entry => entry.message.includes("offer"))
  const hasAnswer = logs.some(entry => entry.message.includes("answer"))
  const hasIce = logs.some(entry => entry.scope === "ice")

  return {
    summary: hasSignalOpen
      ? "Signal channel is opening successfully from the browser."
      : "Signal open log is missing. Check LoadBalancer, DNS, or WebSocket endpoint reachability.",
    signal: hasOffer || hasAnswer
      ? "SDP signaling messages are flowing through the room."
      : "SDP exchange logs are missing. Check join-room delivery and signaling relay logs in CloudWatch.",
    ice: hasIce
      ? "ICE candidates are being generated or received."
      : "ICE activity is missing. Inspect STUN/TURN reachability and browser network restrictions.",
    sdp: hasOffer && hasAnswer
      ? "Offer/Answer pair detected. Media negotiation likely reached peer setup phase."
      : "Offer/Answer pair incomplete. Compare frontend event order with signaling pod logs in CloudWatch.",
  }
})
</script>
