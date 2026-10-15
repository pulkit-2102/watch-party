import uvicorn
import sys
import os

if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

if __name__ == "__main__":
    print("=" * 60)
    print(">> Starting WatchParty Real-Time Sync Application Server")
    print(">> Local UI & API: http://127.0.0.1:8000")
    print(">> Open in two browser tabs or on your local network to test sync!")
    print("=" * 60)
    uvicorn.run("server.main:app", host="0.0.0.0", port=8000, reload=False, log_level="info")
