# SyncSound

SyncSound coordinates the same YouTube video across separate phones. Each person opens the room in their own browser. Each phone plays the video locally, and that phone’s operating system sends the sound to the headphones already paired with it.

A website cannot attach four Bluetooth headsets to one phone. Pair each headset with the phone that person is holding.

Playback is a scheduled start plus drift correction. It is not sample-accurate. Audio never passes through the server.

## What works now

- Create a room for 2–20 people (default 8) and share a 6-character code, link, or QR code.
- Join from other phones on the same Wi-Fi by opening the address Vite prints as the Network URL.
- Shared queue of YouTube video IDs, host approval, and host transfer.
- Official YouTube player on each phone, started from the host’s Play button.
- A single-process FastAPI server with SQLite. Rooms live in memory and are also written to `syncsound.db`.

## What is not built yet

- PostgreSQL, Redis, Alembic, and more than one server process.
- YouTube search. Paste a video URL or an 11-character ID.
- Spotify.
- Docker and a production deployment.

## Prerequisites

- Node.js 22 or newer
- Python 3.12 or newer
- npm

## Run it (Windows PowerShell)

Use two terminals. Start the server first.

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"
.\.venv\Scripts\python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

If `py -3.12` is not available, use the Python 3.12+ command already on your machine for the venv step only.

```powershell
cd frontend
npm install
npm run dev
```

On this computer, open https://localhost:5173.

On each other phone, join the same Wi-Fi and open the same address with this computer’s Wi-Fi IP inside the name, for example `https://192.168.1.5.sslip.io:5173`. YouTube will not play inside a page opened as `http://192.168.1.5` or `https://192.168.1.5`. The certificate is local, so the phone shows a warning the first time. Continue past that warning. The phone’s browser talks to the Vite server, and Vite forwards `/api` and `/ws` to the backend on this computer.

## How four people listen

1. Pair each person’s headphones with their own phone.
2. One person creates a room and shares the code or QR code.
3. The others open the Network URL and join.
4. Anyone allowed to edit the queue pastes the same YouTube URL.
5. The host presses Play. Each phone starts the video. If a phone blocks autoplay, that person taps **Tap to sync and listen**.

## Checks

```powershell
cd frontend
npm test
npm run build
```

```powershell
cd backend
.\.venv\Scripts\python -m pytest
.\.venv\Scripts\python -m ruff check app tests
```

## Configuration

Copy `.env.example` only if you want to override defaults. The backend reads process environment variables. In development it uses `SESSION_SECRET=dev-syncsound-change-me` and `sqlite:///./syncsound.db` when those variables are unset. Production refuses the default secret.

The frontend does not read `.env`. Do not commit a `.env` file or real API keys.

Browser storage:

- `syncsound.preferences.v1` in local storage
- `syncsound.tokens.v1` and `syncsound.memberships.v1` in session storage
- `syncsound.local.rooms.v1` is used only by the local test client

Rooms expire four hours after creation. If the host’s socket stays disconnected for 30 seconds and someone else is still connected, that person becomes the host.

## Known limits

- One backend process. A second process would not see the same in-memory connections.
- Sync depends on each phone’s clock estimate, network, and Bluetooth delay.
- The host must press Play. Listeners cannot start the room.
- Privacy and terms text still needs legal review before any production launch.
