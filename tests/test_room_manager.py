import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.rooms import Room, Participant, RoomManager

class TestRoomManager(unittest.TestCase):
    def setUp(self):
        self.manager = RoomManager()
        self.room = self.manager.get_or_create_room("TEST-01")

    def test_participant_join_first_is_host(self):
        p1 = Participant(client_id="user-1", username="Alice")
        self.room.add_participant(p1)
        self.assertTrue(p1.is_host)
        self.assertEqual(self.room.host_id, "user-1")

        p2 = Participant(client_id="user-2", username="Bob")
        self.room.add_participant(p2)
        self.assertFalse(p2.is_host)
        self.assertEqual(len(self.room.participants), 2)

    def test_host_transfer(self):
        p1 = Participant(client_id="user-1", username="Alice")
        p2 = Participant(client_id="user-2", username="Bob")
        self.room.add_participant(p1)
        self.room.add_participant(p2)

        # Non-host cannot transfer
        res = self.room.transfer_host(requester_id="user-2", target_id="user-2")
        self.assertFalse(res)
        self.assertEqual(self.room.host_id, "user-1")

        # Host can transfer
        res = self.room.transfer_host(requester_id="user-1", target_id="user-2")
        self.assertTrue(res)
        self.assertEqual(self.room.host_id, "user-2")
        self.assertTrue(p2.is_host)
        self.assertFalse(p1.is_host)

    def test_auto_host_succession_on_disconnect(self):
        p1 = Participant(client_id="user-1", username="Alice")
        p2 = Participant(client_id="user-2", username="Bob")
        self.room.add_participant(p1)
        self.room.add_participant(p2)

        # Host disconnects
        new_host = self.room.remove_participant("user-1")
        self.assertEqual(new_host, "user-2")
        self.assertEqual(self.room.host_id, "user-2")
        self.assertTrue(p2.is_host)

    def test_playlist_upvotes_and_sorting(self):
        item1 = self.room.add_to_playlist("Movie A", "http://a.mp4", "10m", "thumb1", "Alice")
        item2 = self.room.add_to_playlist("Movie B", "http://b.mp4", "12m", "thumb2", "Bob")

        # Bob upvotes Movie B
        self.room.upvote_playlist_item(item2.id, "user-2")
        self.assertEqual(len(item2.upvotes), 1)

        # Alice also upvotes Movie B
        self.room.upvote_playlist_item(item2.id, "user-1")
        self.assertEqual(len(item2.upvotes), 2)

    def test_poll_creation_and_voting(self):
        poll = self.room.create_poll(
            question="What genre next?",
            options=["Sci-Fi", "Comedy", "Thriller"],
            created_by="Alice",
            duration_seconds=30
        )
        self.assertIsNotNone(self.room.active_poll)
        
        # User votes for option 0 (Sci-Fi)
        ok = poll.vote("user-1", 0)
        self.assertTrue(ok)
        self.assertEqual(poll.options[0]["votes"], {"user-1"})

        # User changes vote to option 1 (Comedy)
        ok = poll.vote("user-1", 1)
        self.assertTrue(ok)
        self.assertEqual(poll.options[0]["votes"], set())
        self.assertEqual(poll.options[1]["votes"], {"user-1"})

    def test_snapshot_contents(self):
        p1 = Participant(client_id="user-1", username="Alice")
        self.room.add_participant(p1)
        snap = self.room.get_snapshot()

        self.assertEqual(snap["room_code"], "TEST-01")
        self.assertEqual(snap["host_id"], "user-1")
        self.assertIn("playback", snap)
        self.assertIn("participants", snap)
        self.assertIn("playlist", snap)
        self.assertIn("recent_chat", snap)

if __name__ == "__main__":
    unittest.main()
