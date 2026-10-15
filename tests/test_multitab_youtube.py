import asyncio
import json
import websockets
import time

async def test_multitab_youtube_sync():
    room_code = f"YTSYNC-{int(time.time()) % 10000}"
    base_ws = f"ws://127.0.0.1:8000/ws/{room_code}"

    # Tab 1 connects
    ws1 = await websockets.connect(f"{base_ws}?client_id=tab_1&username=Tab1_Host&color=%23FF0055")
    snap1_raw = await ws1.recv()
    snap1 = json.loads(snap1_raw)
    assert snap1["type"] == "snapshot"
    assert snap1["is_host"] is True

    # Tab 1 selects a YouTube video
    yt_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    yt_title = "Never Gonna Give You Up"
    await ws1.send(json.dumps({
        "type": "change_media",
        "media_url": yt_url,
        "media_title": yt_title
    }))

    update1_raw = await ws1.recv()
    update1 = json.loads(update1_raw)
    assert update1["type"] == "playback_update"
    assert update1["playback"]["media_url"] == yt_url
    assert update1["playback"]["media_title"] == yt_title
    assert update1["playback"]["state"] == "paused"

    # Tab 1 plays the video at position 12.5 seconds
    await ws1.send(json.dumps({
        "type": "playback_action",
        "action": "play",
        "position": 12.5
    }))

    play1_raw = await ws1.recv()
    play1 = json.loads(play1_raw)
    assert play1["type"] == "playback_update"
    assert play1["playback"]["state"] == "playing"
    assert play1["playback"]["position_seconds"] == 12.5

    # Tab 2 joins late while YouTube video is already playing
    ws2 = await websockets.connect(f"{base_ws}?client_id=tab_2&username=Tab2_Viewer&color=%2300E5FF")
    
    # Tab 1 gets participant_joined notification
    joined_notif = json.loads(await ws1.recv())
    assert joined_notif["type"] == "participant_joined"

    # Tab 2 gets the snapshot containing the active YouTube video & playing state
    snap2_raw = await ws2.recv()
    snap2 = json.loads(snap2_raw)
    assert snap2["type"] == "snapshot"
    assert snap2["is_host"] is False
    assert snap2["data"]["playback"]["media_url"] == yt_url
    assert snap2["data"]["playback"]["media_title"] == yt_title
    assert snap2["data"]["playback"]["state"] == "playing"
    assert snap2["data"]["playback"]["position_seconds"] >= 12.5

    # Tab 1 pauses the YouTube video at 25.0
    await ws1.send(json.dumps({
        "type": "playback_action",
        "action": "pause",
        "position": 25.0
    }))

    # Both Tab 1 and Tab 2 must receive the pause update
    tab1_pause = json.loads(await ws1.recv())
    tab2_pause = json.loads(await ws2.recv())

    assert tab1_pause["type"] == "playback_update"
    assert tab1_pause["playback"]["state"] == "paused"
    assert tab1_pause["playback"]["position_seconds"] == 25.0

    assert tab2_pause["type"] == "playback_update"
    assert tab2_pause["playback"]["state"] == "paused"
    assert tab2_pause["playback"]["position_seconds"] == 25.0

    # Tab 1 seeks YouTube video to 40.0
    await ws1.send(json.dumps({
        "type": "playback_action",
        "action": "seek",
        "position": 40.0
    }))

    tab1_seek = json.loads(await ws1.recv())
    tab2_seek = json.loads(await ws2.recv())

    assert tab1_seek["playback"]["position_seconds"] == 40.0
    assert tab2_seek["playback"]["position_seconds"] == 40.0

    await ws1.close()
    await ws2.close()
    print("ALL MULTI-TAB YOUTUBE SYNC TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(test_multitab_youtube_sync())
