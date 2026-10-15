import unittest
import time
import sys
import os

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.sync_engine import PlaybackState, SyncEngine

class TestSyncEngine(unittest.TestCase):
    def test_authoritative_position_paused(self):
        state = PlaybackState(
            media_url="https://example.com/video.mp4",
            media_title="Sample",
            state="paused",
            position_seconds=45.5,
            playback_rate=1.0,
            server_timestamp=time.time() - 10.0,
            version=1
        )
        # Position should not advance when paused
        self.assertEqual(state.current_authoritative_position(), 45.5)

    def test_authoritative_position_playing(self):
        t0 = time.time() - 5.0
        state = PlaybackState(
            media_url="https://example.com/video.mp4",
            media_title="Sample",
            state="playing",
            position_seconds=10.0,
            playback_rate=1.0,
            server_timestamp=t0,
            version=1
        )
        pos = state.current_authoritative_position(t0 + 5.0)
        self.assertAlmostEqual(pos, 15.0, places=2)

    def test_authoritative_position_speed_multiplier(self):
        t0 = time.time() - 10.0
        state = PlaybackState(
            media_url="https://example.com/video.mp4",
            media_title="Sample",
            state="playing",
            position_seconds=0.0,
            playback_rate=1.5,
            server_timestamp=t0,
            version=1
        )
        pos = state.current_authoritative_position(t0 + 10.0)
        self.assertAlmostEqual(pos, 15.0, places=2)

    def test_drift_thresholds(self):
        # 1. Negligible drift (< 80ms) -> No action
        res = SyncEngine.evaluate_drift(client_position=10.04, authoritative_position=10.00)
        self.assertEqual(res["action"], "none")
        self.assertEqual(res["target_rate"], 1.0)

        # 2. Moderate client lag (-200ms) -> Slew speedup (1.05x)
        res = SyncEngine.evaluate_drift(client_position=9.80, authoritative_position=10.00)
        self.assertEqual(res["action"], "slew_speedup")
        self.assertEqual(res["target_rate"], 1.05)

        # 3. Moderate client ahead (+250ms) -> Slew slowdown (0.95x)
        res = SyncEngine.evaluate_drift(client_position=10.25, authoritative_position=10.00)
        self.assertEqual(res["action"], "slew_slowdown")
        self.assertEqual(res["target_rate"], 0.95)

        # 4. Large drift (> 500ms) -> Hard seek
        res = SyncEngine.evaluate_drift(client_position=8.50, authoritative_position=10.00)
        self.assertEqual(res["action"], "hard_seek")
        self.assertEqual(res["target_rate"], 1.0)

    def test_concurrent_action_resolution(self):
        state = PlaybackState(
            media_url="https://example.com/vid.mp4",
            media_title="Vid",
            state="paused",
            position_seconds=0.0,
            version=2
        )

        # Non-host cannot mutate playback in host-only mode
        rejected = SyncEngine.resolve_concurrent_action(
            current_state=state,
            incoming_action="play",
            incoming_position=0.0,
            incoming_version=2,
            client_id="guest-1",
            is_host=False,
            host_only_mode=True
        )
        self.assertIsNone(rejected)

        # Host can mutate playback in host-only mode
        accepted = SyncEngine.resolve_concurrent_action(
            current_state=state,
            incoming_action="play",
            incoming_position=0.0,
            incoming_version=2,
            client_id="host-1",
            is_host=True,
            host_only_mode=True
        )
        self.assertIsNotNone(accepted)
        self.assertEqual(accepted.state, "playing")
        self.assertEqual(accepted.version, 3)

        # Seeking updates position and increments version
        seeked = SyncEngine.resolve_concurrent_action(
            current_state=accepted,
            incoming_action="seek",
            incoming_position=120.5,
            incoming_version=3,
            client_id="host-1",
            is_host=True,
            host_only_mode=True
        )
        self.assertIsNotNone(seeked)
        self.assertEqual(seeked.position_seconds, 120.5)
        self.assertEqual(seeked.version, 4)

if __name__ == "__main__":
    unittest.main()
