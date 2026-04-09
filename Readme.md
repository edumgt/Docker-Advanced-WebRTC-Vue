## Vite + Vue3 + TailwindCSS v3 기반 WebRTC 로컬 테스트 모듈 (영상통화 + 채팅 + 화면공유 + 파일전송)
 
> 목표: **localhost**에서 “두 브라우저(또는 시크릿 탭)”로 쉽게 P2P WebRTC 기능을 테스트할 수 있는 최소/실전형 예제  
> 구성:  
> - **Vue 클라이언트**: `App.vue` (WebRTC + UI)  
> - **Signaling 서버**: `signal.js` (Node + ws) — offer/answer/ICE 교환용  
> - **TailwindCSS v3**: UI 빠르게 스타일링

---

## WSL 실행 가이드 (권장)

WSL2에서 Windows 브라우저까지 함께 테스트하려면 **프론트/시그널 서버를 0.0.0.0에 바인딩**해야 합니다.

1. 설치

```bash
npm install
```

2. 시그널 서버 실행

```bash
npm run signal
```

3. 프론트 실행 (WSL 외부 접속 허용)

```bash
npm run dev:wsl
```

또는 한 번에 실행:

```bash
npm run start:wsl
```

### 환경 변수

- `VITE_SIGNAL_URL`: 프론트에서 사용할 시그널 서버 주소 (예: `ws://localhost:3001`)
- `VITE_SIGNAL_PORT`: `VITE_SIGNAL_URL` 미설정 시 사용할 기본 포트 (기본값: `3001`)
- `SIGNAL_HOST`: 시그널 서버 바인딩 호스트 (기본값: `0.0.0.0`)
- `SIGNAL_PORT`: 시그널 서버 포트 (기본값: `3001`)

기본 설정으로도 WSL에서 바로 동작하도록 구성되어 있으며, 브라우저 접속 호스트 기준으로 자동으로 `ws://<host>:3001`를 사용합니다.

---

## 1) 폴더 구조 (예시)

```
my-webrtc-app/
 ├─ signal.js                 # WebSocket signaling 서버
 ├─ package.json              # (Vue 프로젝트) 의존성
 ├─ index.html
 ├─ postcss.config.js
 ├─ tailwind.config.js
 ├─ vite.config.js
 └─ src/
    ├─ App.vue                # ✅ 아래의 “버그 수정 완료” 코드
    ├─ main.js
    └─ index.css
```

> `signal.js`는 Vue 프로젝트 루트에 둬도 되고, `server/` 같은 폴더로 분리해도 됩니다.

---

## 2) 설치 (Tailwind 3 버전 고정)

### 2-1) Vite + Vue 프로젝트 생성

---
```
cd /home/Docker-Advanced-WebRTC-Vue
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```
---
```
sudo tee /etc/wsl.conf >/dev/null <<'EOF'
[user]
default=root
EOF
```

```bash
npm create vite@latest my-webrtc-app -- --template vue
cd my-webrtc-app
npm install
```

---
```
root@DESKTOP-CLQV18N:/home/Docker-Advanced-WebRTC-Vue# which node
which npm
node -v
npm -v
/root/.nvm/versions/node/v24.13.1/bin/node
/root/.nvm/versions/node/v24.13.1/bin/npm
v24.13.1
11.8.0
```

### 2-2) TailwindCSS v3 고정 설치

```bash
npm install -D tailwindcss@3 postcss@8 autoprefixer@10
npx tailwindcss init -p
```

> 만약 설치가 꼬였으면(무한 설치처럼 보이거나 의존성 충돌) 아래 초기화 후 재시도:
```bash
# Windows PowerShell에서도 동작
rmdir /s /q node_modules 2>nul
del package-lock.json 2>nul
npm cache clean --force
npm install
npm install -D tailwindcss@3 postcss@8 autoprefixer@10 --legacy-peer-deps
```

---

## 3) Tailwind 설정

### 3-1) `tailwind.config.js`

```js
export default {
  content: ["./index.html", "./src/**/*.{vue,js,ts}"],
  theme: { extend: {} },
  plugins: [],
}
```

### 3-2) `src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 3-3) `src/main.js`

```js
import { createApp } from "vue"
import "./index.css"
import App from "./App.vue"

createApp(App).mount("#app")
```

---

## 4) Signaling 서버 (Node + ws)

### 4-1) 서버 의존성 설치

Vue 프로젝트 루트에서:

```bash
npm install ws
```

### 4-2) `signal.js` (ESM import 버전)

> Node v22에서 기본적으로 잘 동작합니다. (`import` 사용)

```js
// signal.js
import { WebSocketServer } from "ws"

const wss = new WebSocketServer({ port: 3001 })

wss.on("connection", (ws) => {
  ws.on("message", (message) => {
    // 모든 클라이언트에 브로드캐스트
    // (클라이언트에서 sender ID로 자기 자신 메시지는 무시)
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(message.toString())
    }
  })
})

console.log("✅ Signaling server running on ws://my-app-backend.eba-jnvhrxk5.ap-northeast-2.elasticbeanstalk.com")
```

> 만약 CommonJS(require)로 쓰고 싶다면:
```js
// signal.cjs
const { WebSocketServer } = require("ws")
```

---

## 5) ✅ App.vue (채팅 송수신 버그 수정 + 로컬 테스트 편의 고도화)

아래 코드는 다음을 반영합니다.

- **채팅 안 보이던 버그 수정**
  - `pc.ondatachannel`에서 **chatChannel/fileChannel을 변수에 저장**해야 양쪽에서 전송 가능
  - `sendChat()`는 `readyState === "open"` 확인
- **localhost 테스트 편의**
  - WebSocket은 `onMounted()`에 **1번만 연결**
  - signaling 메시지에 `sender`를 넣고 **자기 자신 메시지 무시**
- **ICE 서버(STUN) 기본값 추가**
  - 로컬에서도 대부분 문제 없지만, 실제 환경에 가까운 테스트에 도움

> ⚠️ 현재 흐름은 **두 브라우저(또는 시크릿 탭)에서 모두 `Call`을 눌러야** 연결이 완료되는 형태입니다.  
> (상대방이 Call을 누르지 않으면 offer를 받아도 처리하지 않습니다. “초대/수락” 모델로 바꾸는 건 다음 단계에서 분리 가능합니다.)

## 6) 실행 방법 (localhost)

### 6-1) signaling 서버 실행

프로젝트 루트에서:

```bash
node signal.js
# ✅ Signaling server running on ws://my-app-backend.eba-jnvhrxk5.ap-northeast-2.elasticbeanstalk.com
```

### 6-2) Vue 앱 실행

```bash
npm run dev
# http://localhost:5173
```

### 6-3) 테스트 시나리오

1) 브라우저 2개(예: 크롬 + 엣지, 또는 크롬 + 시크릿 탭)에서  
   `http://localhost:5173` 접속

2) **양쪽 모두** `📞 Call` 버튼 클릭  
   - 한쪽이 offer 전송  
   - 다른 쪽이 answer 전송  
   - ICE candidate 교환되며 연결

3) 연결되면:
- 영상/음성: Local/Remote 영상 표시
- 채팅: 양쪽에서 입력하면 서로 표시
- 파일: 작은 파일 업로드 → 상대에게 링크 생성
- 화면공유: `🖥 화면공유` 클릭 → 상대 화면이 공유 화면으로 바뀜 (종료 시 카메라 복귀)

---

## 7) 자주 겪는 문제/체크리스트

### A) `Cannot find package 'ws' ...`
```bash
npm install ws
```

### B) 카메라/마이크 권한 문제
- 브라우저 주소창 왼쪽의 “자물쇠/권한”에서 카메라/마이크 허용
- 로컬 테스트는 `http://localhost`는 대체로 허용되지만, 실제 배포는 **HTTPS** 필수

### C) NAT/방화벽 환경에서 연결 실패
- 로컬은 대부분 STUN만으로 되지만, 실제 서비스는 **TURN 서버**가 필요할 수 있음

### D) 파일 전송이 큰 파일에서 깨짐
- DataChannel은 큰 파일을 **청크 분할 전송**해야 안정적
- 이 예제는 “로컬 소형 파일” 검증용
