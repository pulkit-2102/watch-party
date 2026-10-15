from typing import List, Dict, Any

FEATURED_MOVIES: List[Dict[str, Any]] = [
    {
        "id": "big-buck-bunny",
        "title": "Big Buck Bunny (HD)",
        "year": 2008,
        "duration": "0m 33s",
        "duration_seconds": 33,
        "rating": 8.5,
        "genres": ["Animation", "Comedy", "Family"],
        "director": "Sacha Goedegebure",
        "cast": ["Bunny", "Frank", "Rinky", "Gimera"],
        "description": "A large and lovable rabbit deals with forest bullies in this iconic open-source animation masterpiece.",
        "poster": "https://images.unsplash.com/photo-1563089145-599997674d42?w=600&auto=format&fit=crop&q=80",
        "backdrop": "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=1200&auto=format&fit=crop&q=80",
        "stream_url": "/static/media/bunny_trailer.mp4",
        "category": "Animation & Fantasy"
    },
    {
        "id": "sintel",
        "title": "Sintel (The Durian Project)",
        "year": 2010,
        "duration": "0m 52s",
        "duration_seconds": 52,
        "rating": 8.7,
        "genres": ["Animation", "Fantasy", "Drama"],
        "director": "Colin Levy",
        "cast": ["Halina Reijn", "Thom Hoffman"],
        "description": "A courageous young nomad named Sintel travels across mountains and ancient ruins searching for her lost baby dragon.",
        "poster": "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80",
        "backdrop": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80",
        "stream_url": "/static/media/sintel_trailer.mp4",
        "category": "Animation & Fantasy"
    },
    {
        "id": "tears-of-steel",
        "title": "Tears of Steel (VFX sequence)",
        "year": 2012,
        "duration": "0m 40s",
        "duration_seconds": 40,
        "rating": 8.4,
        "genres": ["Sci-Fi", "Cyberpunk", "Action"],
        "director": "Ian Hubert",
        "cast": ["Derek de Lint", "Sergio Hasselbaink"],
        "description": "In a dystopian cyberpunk Amsterdam, scientists and renegade defenders attempt a temporal reset against mechanical invaders.",
        "poster": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
        "backdrop": "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&auto=format&fit=crop&q=80",
        "stream_url": "/static/media/tears_of_steel_sample.mp4",
        "category": "Sci-Fi & Cyberpunk"
    },
    {
        "id": "oceans-nature",
        "title": "Oceans: The Living Deep",
        "year": 2021,
        "duration": "0m 47s",
        "duration_seconds": 47,
        "rating": 9.1,
        "genres": ["Documentary", "Nature"],
        "director": "Jacques Perrin",
        "cast": ["Marine Life", "Narrator"],
        "description": "Dive deep beneath ocean crests exploring vibrant coral reefs, migrating whales, and the mysteries of the blue planet.",
        "poster": "https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=600&auto=format&fit=crop&q=80",
        "backdrop": "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=1200&auto=format&fit=crop&q=80",
        "stream_url": "/static/media/nature_stream.mp4",
        "category": "Nature & Documentaries"
    },
    {
        "id": "fast-pursuit",
        "title": "Fast Pursuit: Street Action",
        "year": 2023,
        "duration": "0m 28s",
        "duration_seconds": 28,
        "rating": 8.0,
        "genres": ["Action", "Motorsport"],
        "director": "Alex Stone",
        "cast": ["Drivers", "Stunt Crew"],
        "description": "High-octane vehicles speed through night-lit city freeways in an adrenaline-packed pursuit.",
        "poster": "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=600&auto=format&fit=crop&q=80",
        "backdrop": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1200&auto=format&fit=crop&q=80",
        "stream_url": "/static/media/action_car.mp4",
        "category": "Action & Adrenaline"
    },
    {
        "id": "cyber-city",
        "title": "Neon Metropol: City Pulse",
        "year": 2022,
        "duration": "0m 40s",
        "duration_seconds": 40,
        "rating": 8.2,
        "genres": ["Sci-Fi", "Cyberpunk", "Urban"],
        "director": "Elena Vance",
        "cast": ["City Walkers"],
        "description": "Witness the kinetic energy of an electric city at twilight with glowing neon crosswalks and soaring architectural spires.",
        "poster": "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80",
        "backdrop": "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&auto=format&fit=crop&q=80",
        "stream_url": "/static/media/city_traffic.mp4",
        "category": "Sci-Fi & Cyberpunk"
    },
    {
        "id": "bunny-classic",
        "title": "Big Buck Bunny: Classic Short",
        "year": 2008,
        "duration": "0m 33s",
        "duration_seconds": 33,
        "rating": 8.3,
        "genres": ["Animation", "Comedy"],
        "director": "Blender Foundation",
        "cast": ["Bunny"],
        "description": "The timeless open-movie short featuring Big Buck Bunny exploring the morning meadow.",
        "poster": "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=600&auto=format&fit=crop&q=80",
        "backdrop": "https://images.unsplash.com/photo-1563089145-599997674d42?w=1200&auto=format&fit=crop&q=80",
        "stream_url": "/static/media/big_buck_bunny.mp4",
        "category": "Animation & Fantasy"
    },
    {
        "id": "yt-rick-astley",
        "title": "Rick Astley - Never Gonna Give You Up (Official Music Video)",
        "year": 1987,
        "duration": "3m 32s",
        "duration_seconds": 212,
        "rating": 9.9,
        "genres": ["Music", "Pop", "Classics"],
        "director": "Simon West",
        "cast": ["Rick Astley"],
        "description": "The immortal pop music legend and global phenomenon with over 1.6 billion views on YouTube.",
        "poster": "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        "backdrop": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1200&auto=format&fit=crop&q=80",
        "stream_url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "category": "Music & Trending"
    },
    {
        "id": "yt-lofi-beats",
        "title": "Lofi Hip Hop - Chill Beats to Relax/Study to",
        "year": 2024,
        "duration": "Live Stream",
        "duration_seconds": 3600,
        "rating": 9.5,
        "genres": ["Music", "Lofi", "Chill"],
        "director": "Lofi Girl",
        "cast": ["Lofi Girl"],
        "description": "Iconic chill beats and soothing melodies for relaxing, studying, or partying together.",
        "poster": "https://img.youtube.com/vi/jfKfPfyJRdk/hqdefault.jpg",
        "backdrop": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&auto=format&fit=crop&q=80",
        "stream_url": "https://www.youtube.com/watch?v=jfKfPfyJRdk",
        "category": "Music & Trending"
    }
]

def search_movies(query: str = "", category: str = "", genre: str = "") -> List[Dict[str, Any]]:
    results = FEATURED_MOVIES
    if category and category != "All":
        results = [m for m in results if m.get("category") == category]
    if genre and genre != "All":
        results = [m for m in results if genre.lower() in [g.lower() for g in m.get("genres", [])]]
    if query:
        q = query.lower().strip()
        matched = []
        for m in results:
            score = 0
            if q in m["title"].lower():
                score += 10
            if q in m["description"].lower():
                score += 3
            if q in m.get("director", "").lower():
                score += 5
            for g in m.get("genres", []):
                if q in g.lower():
                    score += 4
            if score > 0:
                matched.append((score, m))
        matched.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in matched]
    return results
