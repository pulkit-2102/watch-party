import time
import uuid
import random
from typing import Dict, List, Optional, Any, Set
from fastapi import WebSocket
from server.sync_engine import PlaybackState, SyncEngine
from server.movies_data import FEATURED_MOVIES

DEFAULT_AVATAR_COLORS = [
    "#FF4D4D", "#FF9F43", "#FECA57", "#1DD1A1", "#48DBFB",
    "#54A0FF", "#5f27cd", "#FF6B6B", "#C8D6E5", "#00D2D3"
]

class Participant:
    def __init__(self, client_id: str, username: str, is_host: bool = False, color: Optional[str] = None):
        self.id = client_id
        self.username = username
        self.is_host = is_host
        self.color = color or random.choice(DEFAULT_AVATAR_COLORS)
        self.joined_at = time.time()
        self.last_seen = time.time()
        self.latency_ms: float = 0.0
        self.client_position: float = 0.0
        self.drift_ms: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "username": self.username,
            "is_host": self.is_host,
            "color": self.color,
            "joined_at": self.joined_at,
            "latency_ms": round(self.latency_ms, 1),
            "client_position": round(self.client_position, 2),
            "drift_ms": round(self.drift_ms, 1)
        }

class PlaylistItem:
    def __init__(self, item_id: str, title: str, url: str, duration: str, thumbnail: str, added_by: str):
        self.id = item_id
        self.title = title
        self.url = url
        self.duration = duration
        self.thumbnail = thumbnail
        self.added_by = added_by
        self.upvotes: Set[str] = set()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "url": self.url,
            "duration": self.duration,
            "thumbnail": self.thumbnail,
            "added_by": self.added_by,
            "upvotes_count": len(self.upvotes),
            "upvotes": list(self.upvotes)
        }

class Poll:
    def __init__(self, poll_id: str, question: str, options: List[str], created_by: str, duration_seconds: int = 60):
        self.id = poll_id
        self.question = question
        self.options = [{"id": idx, "text": opt, "votes": set()} for idx, opt in enumerate(options)]
        self.created_by = created_by
        self.created_at = time.time()
        self.expires_at = self.created_at + duration_seconds
        self.is_active = True

    def vote(self, user_id: str, option_id: int) -> bool:
        if not self.is_active or time.time() > self.expires_at:
            self.is_active = False
            return False
        # Remove user's previous votes
        for opt in self.options:
            opt["votes"].discard(user_id)
        # Add new vote
        if 0 <= option_id < len(self.options):
            self.options[option_id]["votes"].add(user_id)
            return True
        return False

    def to_dict(self) -> Dict[str, Any]:
        total_votes = sum(len(opt["votes"]) for opt in self.options)
        now = time.time()
        time_left = max(0, int(self.expires_at - now))
        is_active = self.is_active and time_left > 0
        return {
            "id": self.id,
            "question": self.question,
            "options": [
                {
                    "id": opt["id"],
                    "text": opt["text"],
                    "votes_count": len(opt["votes"]),
                    "percentage": round((len(opt["votes"]) / total_votes * 100), 1) if total_votes > 0 else 0
                }
                for opt in self.options
            ],
            "total_votes": total_votes,
            "created_by": self.created_by,
            "time_left_seconds": time_left,
            "is_active": is_active
        }

class Room:
    def __init__(self, code: str):
        self.code = code
        self.created_at = time.time()
        self.host_id: Optional[str] = None
        self.host_only_mode: bool = False
        self.participants: Dict[str, Participant] = {}
        self.connections: Dict[str, WebSocket] = {}
        
        # Initial playback state pointing to Tears of Steel
        default_movie = FEATURED_MOVIES[0]
        self.playback_state = PlaybackState(
            media_url=default_movie["stream_url"],
            media_title=default_movie["title"],
            state="paused",
            position_seconds=0.0,
            playback_rate=1.0,
            server_timestamp=time.time(),
            version=1,
            updated_by="system"
        )
        
        self.playlist: List[PlaylistItem] = [
            PlaylistItem(
                item_id=f"init-{idx+1}",
                title=m["title"],
                url=m["stream_url"],
                duration=m["duration"],
                thumbnail=m["poster"],
                added_by="System"
            )
            for idx, m in enumerate(FEATURED_MOVIES[:4])
        ]
        self.current_playlist_index: int = 0
        self.active_poll: Optional[Poll] = None
        self.chat_history: List[Dict[str, Any]] = []

    def add_participant(self, participant: Participant, ws: Optional[WebSocket] = None) -> None:
        # First person becomes host
        if not self.participants or not self.host_id:
            participant.is_host = True
            self.host_id = participant.id
        elif participant.id == self.host_id:
            participant.is_host = True

        self.participants[participant.id] = participant
        if ws:
            self.connections[participant.id] = ws

        self.add_system_message(f"✨ {participant.username} joined the party")

    def remove_participant(self, client_id: str) -> Optional[str]:
        p = self.participants.pop(client_id, None)
        self.connections.pop(client_id, None)
        if not p:
            return None

        self.add_system_message(f"👋 {p.username} left the party")

        # Auto-transfer host if host leaves
        if self.host_id == client_id:
            if self.participants:
                new_host_id = next(iter(self.participants.keys()))
                self.host_id = new_host_id
                self.participants[new_host_id].is_host = True
                new_host_name = self.participants[new_host_id].username
                self.add_system_message(f"👑 Host transferred to {new_host_name}")
                return new_host_id
            else:
                self.host_id = None
        return None

    def transfer_host(self, requester_id: str, target_id: str) -> bool:
        if requester_id != self.host_id:
            return False
        if target_id not in self.participants:
            return False

        old_host = self.participants[self.host_id]
        old_host.is_host = False

        new_host = self.participants[target_id]
        new_host.is_host = True
        self.host_id = target_id

        self.add_system_message(f"👑 Host privileges transferred to {new_host.username}")
        return True

    def toggle_host_only(self, requester_id: str, host_only: bool) -> bool:
        if requester_id != self.host_id:
            return False
        self.host_only_mode = host_only
        mode_str = "Host Only (Strict)" if host_only else "Collaborative (Open)"
        self.add_system_message(f"🔒 Playback control set to {mode_str}")
        return True

    def add_chat_message(self, client_id: str, username: str, text: str, msg_type: str = "chat", extra: Optional[Dict] = None) -> Dict[str, Any]:
        color = self.participants[client_id].color if client_id in self.participants else "#FFFFFF"
        msg = {
            "id": str(uuid.uuid4()),
            "client_id": client_id,
            "username": username,
            "color": color,
            "text": text,
            "timestamp": time.time(),
            "type": msg_type,
            "extra": extra or {}
        }
        self.chat_history.append(msg)
        if len(self.chat_history) > 150:
            self.chat_history.pop(0)
        return msg

    def add_system_message(self, text: str) -> Dict[str, Any]:
        msg = {
            "id": str(uuid.uuid4()),
            "client_id": "system",
            "username": "System",
            "color": "#818CF8",
            "text": text,
            "timestamp": time.time(),
            "type": "system",
            "extra": {}
        }
        self.chat_history.append(msg)
        if len(self.chat_history) > 150:
            self.chat_history.pop(0)
        return msg

    def add_to_playlist(self, title: str, url: str, duration: str, thumbnail: str, added_by: str) -> PlaylistItem:
        item = PlaylistItem(
            item_id=str(uuid.uuid4())[:8],
            title=title,
            url=url,
            duration=duration,
            thumbnail=thumbnail,
            added_by=added_by
        )
        self.playlist.append(item)
        self.add_system_message(f"🎵 {added_by} added '{title}' to queue")
        return item

    def upvote_playlist_item(self, item_id: str, user_id: str) -> bool:
        for item in self.playlist:
            if item.id == item_id:
                if user_id in item.upvotes:
                    item.upvotes.remove(user_id)
                else:
                    item.upvotes.add(user_id)
                # Re-sort future items in playlist by upvotes desc, keeping currently playing item
                if len(self.playlist) > 1:
                    current = self.playlist[self.current_playlist_index]
                    remaining = [it for it in self.playlist if it.id != current.id]
                    remaining.sort(key=lambda x: len(x.upvotes), reverse=True)
                    self.playlist = [current] + remaining
                    self.current_playlist_index = 0
                return True
        return False

    def next_in_playlist(self) -> Optional[PlaylistItem]:
        if not self.playlist:
            return None
        self.current_playlist_index = (self.current_playlist_index + 1) % len(self.playlist)
        item = self.playlist[self.current_playlist_index]
        self.playback_state = PlaybackState(
            media_url=item.url,
            media_title=item.title,
            state="playing",
            position_seconds=0.0,
            playback_rate=1.0,
            server_timestamp=time.time(),
            version=self.playback_state.version + 1,
            updated_by="playlist_auto"
        )
        self.add_system_message(f"▶️ Now playing from queue: '{item.title}'")
        return item

    def create_poll(self, question: str, options: List[str], created_by: str, duration_seconds: int = 60) -> Poll:
        poll = Poll(str(uuid.uuid4())[:8], question, options, created_by, duration_seconds)
        self.active_poll = poll
        self.add_system_message(f"📊 {created_by} started a poll: '{question}'")
        return poll

    def get_snapshot(self) -> Dict[str, Any]:
        """
        Produces full room state snapshot for late joins and fresh reconnections.
        """
        now = time.time()
        return {
            "room_code": self.code,
            "host_id": self.host_id,
            "host_only_mode": self.host_only_mode,
            "server_time": now,
            "playback": self.playback_state.to_dict(),
            "participants": [p.to_dict() for p in self.participants.values()],
            "playlist": [item.to_dict() for item in self.playlist],
            "current_playlist_index": self.current_playlist_index,
            "active_poll": self.active_poll.to_dict() if self.active_poll else None,
            "recent_chat": self.chat_history[-40:],
        }

class RoomManager:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}

    def get_or_create_room(self, code: Optional[str] = None) -> Room:
        if not code:
            code = self.generate_room_code()
        code = code.upper().strip()
        if code not in self.rooms:
            self.rooms[code] = Room(code)
        return self.rooms[code]

    def get_room(self, code: str) -> Optional[Room]:
        return self.rooms.get(code.upper().strip())

    @staticmethod
    def generate_room_code() -> str:
        adjectives = ["NEON", "COSMO", "CYBER", "SOLAR", "LUNAR", "RETRO", "STELLAR", "HYPER", "PULSE"]
        num = random.randint(10, 99)
        return f"{random.choice(adjectives)}-{num}"

room_manager = RoomManager()
