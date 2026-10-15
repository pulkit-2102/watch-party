import time
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field

class PlaybackState(BaseModel):
    media_url: str
    media_title: str
    state: str = "paused"  # "playing" | "paused" | "buffering"
    position_seconds: float = 0.0
    playback_rate: float = 1.0
    server_timestamp: float = Field(default_factory=time.time)
    version: int = 1
    updated_by: str = "system"

    def current_authoritative_position(self, at_time: Optional[float] = None) -> float:
        """
        Calculates the authoritative media position at a specific server timestamp.
        If paused or buffering, the position is stationary.
        If playing, advances linearly with playback_rate.
        """
        if at_time is None:
            at_time = time.time()
        
        if self.state == "playing":
            elapsed = max(0.0, at_time - self.server_timestamp)
            return round(self.position_seconds + (elapsed * self.playback_rate), 3)
        return round(self.position_seconds, 3)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "media_url": self.media_url,
            "media_title": self.media_title,
            "state": self.state,
            "position_seconds": self.position_seconds,
            "computed_position": self.current_authoritative_position(),
            "playback_rate": self.playback_rate,
            "server_timestamp": self.server_timestamp,
            "version": self.version,
            "updated_by": self.updated_by
        }

class SyncEngine:
    """
    Manages synchronization calculations, clock offset estimation,
    drift classification, and conflict resolution.
    """
    SOFT_SLEW_MIN_DRIFT = 0.080  # 80ms: below this is considered in-frame sync
    HARD_SEEK_DRIFT = 0.500      # 500ms: above this requires an instantaneous seek

    @staticmethod
    def process_ntp_ping(client_t0: float, server_t1: float) -> Dict[str, float]:
        """
        Handles NTP time exchange packet.
        client_t0: client departure time (ms or s)
        server_t1: server arrival time (s)
        server_t2: server transmit time (s)
        """
        server_t2 = time.time()
        return {
            "t0": client_t0,
            "t1": server_t1,
            "t2": server_t2,
        }

    @staticmethod
    def evaluate_drift(client_position: float, authoritative_position: float) -> Dict[str, Any]:
        """
        Evaluates drift between client position and authoritative room position.
        Returns drift magnitude and recommended action: 'none', 'slew_speedup', 'slew_slowdown', 'hard_seek'.
        """
        drift = client_position - authoritative_position  # positive = client ahead, negative = client behind
        abs_drift = abs(drift)

        if abs_drift < SyncEngine.SOFT_SLEW_MIN_DRIFT:
            action = "none"
            target_rate = 1.0
        elif abs_drift <= SyncEngine.HARD_SEEK_DRIFT:
            # Slew rate adjustment to smoothly eliminate drift without jarring pitch artifacts
            if drift < 0:
                # Client is behind, speed up slightly
                action = "slew_speedup"
                target_rate = 1.05
            else:
                # Client is ahead, slow down slightly
                action = "slew_slowdown"
                target_rate = 0.95
        else:
            action = "hard_seek"
            target_rate = 1.0

        return {
            "drift_seconds": round(drift, 4),
            "drift_ms": round(drift * 1000, 1),
            "abs_drift_ms": round(abs_drift * 1000, 1),
            "action": action,
            "target_rate": target_rate,
            "authoritative_position": authoritative_position
        }

    @staticmethod
    def resolve_concurrent_action(
        current_state: PlaybackState,
        incoming_action: str,  # "play", "pause", "seek"
        incoming_position: float,
        incoming_version: int,
        client_id: str,
        is_host: bool,
        host_only_mode: bool
    ) -> Optional[PlaybackState]:
        """
        Authoritative validation of playback mutations.
        Returns updated PlaybackState if valid, or None if rejected.
        """
        if host_only_mode and not is_host:
            return None

        now = time.time()
        new_version = current_state.version + 1

        if incoming_action == "play":
            pos = incoming_position if incoming_position >= 0 else current_state.current_authoritative_position(now)
            return PlaybackState(
                media_url=current_state.media_url,
                media_title=current_state.media_title,
                state="playing",
                position_seconds=round(pos, 3),
                playback_rate=current_state.playback_rate,
                server_timestamp=now,
                version=new_version,
                updated_by=client_id
            )

        elif incoming_action == "pause":
            pos = incoming_position if incoming_position >= 0 else current_state.current_authoritative_position(now)
            return PlaybackState(
                media_url=current_state.media_url,
                media_title=current_state.media_title,
                state="paused",
                position_seconds=round(pos, 3),
                playback_rate=current_state.playback_rate,
                server_timestamp=now,
                version=new_version,
                updated_by=client_id
            )

        elif incoming_action == "seek":
            return PlaybackState(
                media_url=current_state.media_url,
                media_title=current_state.media_title,
                state=current_state.state,
                position_seconds=round(max(0.0, incoming_position), 3),
                playback_rate=current_state.playback_rate,
                server_timestamp=now,
                version=new_version,
                updated_by=client_id
            )

        return None
