import os
import time
import json
import asyncio
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from server.sync_engine import SyncEngine, PlaybackState
from server.rooms import room_manager, Participant
from server.movies_data import search_movies, FEATURED_MOVIES

app = FastAPI(title="WatchParty Real-Time Sync API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Mount static files
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
async def get_index():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.get("/room/{room_code}")
async def get_room_page(room_code: str):
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": time.time(),
        "active_rooms": len(room_manager.rooms),
        "total_participants": sum(len(r.participants) for r in room_manager.rooms.values())
    }

@app.get("/api/movies")
async def get_movies(
    q: Optional[str] = Query(None, description="Search query"),
    category: Optional[str] = Query(None, description="Category filter"),
    genre: Optional[str] = Query(None, description="Genre filter")
):
    results = search_movies(query=q or "", category=category or "", genre=genre or "")
    return {
        "count": len(results),
        "movies": results
    }

@app.post("/api/rooms")
async def create_room(payload: dict = {}):
    requested_code = payload.get("code")
    room = room_manager.get_or_create_room(requested_code)
    return {
        "room_code": room.code,
        "created_at": room.created_at,
        "host_id": room.host_id
    }

@app.get("/api/rooms/{code}")
async def check_room(code: str):
    room = room_manager.get_room(code)
    if not room:
        return JSONResponse(status_code=404, content={"exists": False, "message": "Room not found"})
    return {
        "exists": True,
        "room_code": room.code,
        "participant_count": len(room.participants),
        "host_only_mode": room.host_only_mode,
        "current_title": room.playback_state.media_title
    }

async def broadcast_to_room(room, message: dict, exclude_client_id: Optional[str] = None):
    dead_clients = []
    text_data = json.dumps(message)
    for cid, ws in list(room.connections.items()):
        if exclude_client_id and cid == exclude_client_id:
            continue
        try:
            await ws.send_text(text_data)
        except Exception:
            dead_clients.append(cid)
    for cid in dead_clients:
        room.remove_participant(cid)

@app.websocket("/ws/{room_code}")
async def websocket_room_endpoint(
    websocket: WebSocket,
    room_code: str,
    client_id: str = Query(...),
    username: str = Query("Guest"),
    color: Optional[str] = Query(None)
):
    await websocket.accept()
    room = room_manager.get_or_create_room(room_code)
    participant = Participant(client_id=client_id, username=username, color=color)
    room.add_participant(participant, ws=websocket)

    # 1. Immediate full snapshot for late joins and initialization
    snapshot = room.get_snapshot()
    await websocket.send_text(json.dumps({
        "type": "snapshot",
        "data": snapshot,
        "your_client_id": client_id,
        "is_host": participant.is_host
    }))

    # 2. Inform peers of new participant
    await broadcast_to_room(
        room,
        {
            "type": "participant_joined",
            "participant": participant.to_dict(),
            "participants": [p.to_dict() for p in room.participants.values()],
            "chat_message": room.chat_history[-1] if room.chat_history else None
        },
        exclude_client_id=client_id
    )

    try:
        while True:
            raw_text = await websocket.receive_text()
            t_recv = time.time()
            data = json.loads(raw_text)
            msg_type = data.get("type")

            # NTP Ping / Clock Offset Exchange
            if msg_type == "ntp_ping":
                client_t0 = data.get("t0", 0.0)
                ntp_res = SyncEngine.process_ntp_ping(client_t0, t_recv)
                await websocket.send_text(json.dumps({
                    "type": "ntp_pong",
                    **ntp_res
                }))
                continue

            # Participant Telemetry Heartbeat
            elif msg_type == "telemetry_report":
                participant.latency_ms = data.get("latency_ms", 0.0)
                participant.client_position = data.get("client_position", 0.0)
                participant.drift_ms = data.get("drift_ms", 0.0)
                participant.last_seen = t_recv
                continue

            # Playback Control Action (Play, Pause, Seek)
            elif msg_type == "playback_action":
                action = data.get("action")
                pos = float(data.get("position", 0.0))
                ver = int(data.get("version", room.playback_state.version))
                
                updated_state = SyncEngine.resolve_concurrent_action(
                    current_state=room.playback_state,
                    incoming_action=action,
                    incoming_position=pos,
                    incoming_version=ver,
                    client_id=client_id,
                    is_host=participant.is_host,
                    host_only_mode=room.host_only_mode
                )

                if updated_state:
                    room.playback_state = updated_state
                    # Log system action message
                    time_fmt = f"{int(pos // 60):02d}:{int(pos % 60):02d}"
                    action_verbs = {
                        "play": f"▶️ {participant.username} played at {time_fmt}",
                        "pause": f"⏸️ {participant.username} paused at {time_fmt}",
                        "seek": f"⏩ {participant.username} jumped to {time_fmt}"
                    }
                    if action in action_verbs:
                        sys_msg = room.add_system_message(action_verbs[action])
                    else:
                        sys_msg = None

                    # Broadcast authoritative state update with server transmit timestamp
                    broadcast_payload = {
                        "type": "playback_update",
                        "playback": room.playback_state.to_dict(),
                        "server_transmit_time": time.time(),
                        "action": action,
                        "triggered_by": client_id,
                        "chat_message": sys_msg
                    }
                    await broadcast_to_room(room, broadcast_payload)
                else:
                    # Action rejected (e.g., non-host attempted modification in Host-Only mode)
                    await websocket.send_text(json.dumps({
                        "type": "action_rejected",
                        "reason": "Host-Only mode is enabled. Only the host can modify playback.",
                        "current_playback": room.playback_state.to_dict()
                    }))

            # Change Video / Movie Selection
            elif msg_type == "change_media":
                if room.host_only_mode and not participant.is_host:
                    await websocket.send_text(json.dumps({
                        "type": "action_rejected",
                        "reason": "Only host can change the currently playing media."
                    }))
                    continue
                
                media_url = data.get("media_url")
                media_title = data.get("media_title", "Custom Video")
                room.playback_state = PlaybackState(
                    media_url=media_url,
                    media_title=media_title,
                    state="paused",
                    position_seconds=0.0,
                    playback_rate=1.0,
                    server_timestamp=time.time(),
                    version=room.playback_state.version + 1,
                    updated_by=client_id
                )
                room.add_system_message(f"🎬 {participant.username} switched video to '{media_title}'")
                await broadcast_to_room(room, {
                    "type": "playback_update",
                    "playback": room.playback_state.to_dict(),
                    "server_transmit_time": time.time(),
                    "action": "change_media",
                    "triggered_by": client_id,
                    "chat_message": room.chat_history[-1]
                })

            # Live Chat Message
            elif msg_type == "chat_message":
                text = data.get("text", "").strip()
                if text:
                    msg = room.add_chat_message(client_id, participant.username, text)
                    await broadcast_to_room(room, {
                        "type": "chat_message",
                        "message": msg
                    })

            # Danmaku Flying Bullet Comment
            elif msg_type == "danmaku":
                text = data.get("text", "").strip()
                if text:
                    dm_payload = {
                        "type": "danmaku",
                        "id": str(time.time()),
                        "sender": participant.username,
                        "color": participant.color,
                        "text": text,
                        "timestamp": time.time()
                    }
                    # Danmaku also appears in chat log
                    room.add_chat_message(client_id, participant.username, text, msg_type="danmaku")
                    await broadcast_to_room(room, dm_payload)

            # Emoji Reaction Particle Burst
            elif msg_type == "reaction":
                emoji = data.get("emoji", "❤️")
                await broadcast_to_room(room, {
                    "type": "reaction",
                    "emoji": emoji,
                    "sender": participant.username,
                    "color": participant.color,
                    "timestamp": time.time()
                })

            # Playlist Add
            elif msg_type == "playlist_add":
                title = data.get("title", "Unknown Title")
                url = data.get("url")
                duration = data.get("duration", "0m")
                thumb = data.get("thumbnail", "")
                if url:
                    item = room.add_to_playlist(title, url, duration, thumb, participant.username)
                    await broadcast_to_room(room, {
                        "type": "playlist_updated",
                        "playlist": [it.to_dict() for it in room.playlist],
                        "chat_message": room.chat_history[-1]
                    })

            # Playlist Upvote
            elif msg_type == "playlist_upvote":
                item_id = data.get("item_id")
                if item_id and room.upvote_playlist_item(item_id, client_id):
                    await broadcast_to_room(room, {
                        "type": "playlist_updated",
                        "playlist": [it.to_dict() for it in room.playlist]
                    })

            # Playlist Next
            elif msg_type == "playlist_next":
                if room.host_only_mode and not participant.is_host:
                    continue
                next_item = room.next_in_playlist()
                if next_item:
                    await broadcast_to_room(room, {
                        "type": "playback_update",
                        "playback": room.playback_state.to_dict(),
                        "server_transmit_time": time.time(),
                        "action": "change_media",
                        "triggered_by": client_id,
                        "playlist": [it.to_dict() for it in room.playlist],
                        "current_playlist_index": room.current_playlist_index,
                        "chat_message": room.chat_history[-1]
                    })

            # Poll Create
            elif msg_type == "poll_create":
                question = data.get("question", "").strip()
                options = data.get("options", [])
                duration = int(data.get("duration_seconds", 60))
                if question and len(options) >= 2:
                    poll = room.create_poll(question, options, participant.username, duration)
                    await broadcast_to_room(room, {
                        "type": "poll_updated",
                        "poll": poll.to_dict(),
                        "chat_message": room.chat_history[-1]
                    })

            # Poll Vote
            elif msg_type == "poll_vote":
                opt_id = int(data.get("option_id", -1))
                if room.active_poll and room.active_poll.vote(client_id, opt_id):
                    await broadcast_to_room(room, {
                        "type": "poll_updated",
                        "poll": room.active_poll.to_dict()
                    })

            # Host Transfer
            elif msg_type == "transfer_host":
                target_id = data.get("target_id")
                if target_id and room.transfer_host(client_id, target_id):
                    await broadcast_to_room(room, {
                        "type": "host_transferred",
                        "new_host_id": target_id,
                        "participants": [p.to_dict() for p in room.participants.values()],
                        "chat_message": room.chat_history[-1]
                    })

            # Host Lock Toggle
            elif msg_type == "toggle_host_only":
                h_only = bool(data.get("host_only", False))
                if room.toggle_host_only(client_id, h_only):
                    await broadcast_to_room(room, {
                        "type": "host_only_toggled",
                        "host_only_mode": room.host_only_mode,
                        "chat_message": room.chat_history[-1]
                    })

    except WebSocketDisconnect:
        new_host_id = room.remove_participant(client_id)
        leave_payload = {
            "type": "participant_left",
            "client_id": client_id,
            "participants": [p.to_dict() for p in room.participants.values()],
            "chat_message": room.chat_history[-1] if room.chat_history else None
        }
        if new_host_id:
            leave_payload["new_host_id"] = new_host_id
        await broadcast_to_room(room, leave_payload)
    except Exception as e:
        room.remove_participant(client_id)
