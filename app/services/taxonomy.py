"""Category taxonomies, query synthesis maps, and page modifiers."""
from typing import Dict, List, Optional

CATEGORY_TAXONOMY: Dict[str, List[Dict[str, str]]] = {
    "science": [
        {"sub": "quantum", "query": "quantum physics quantum computing mechanics"},
        {"sub": "chemistry", "query": "chemistry experiments chemical reactions science laboratory"},
        {"sub": "biology", "query": "biology genetics neuroscience human body science documentary"},
        {"sub": "robotics", "query": "robotics engineering inventions tech future science"},
        {"sub": "space", "query": "space exploration astronomy astrophysics cosmos james webb"},
    ],
    "comedy": [
        {"sub": "sketches", "query": "sketch comedy funny skits original parodies humor"},
        {"sub": "standup", "query": "stand up comedy special live show humor"},
        {"sub": "sitcom", "query": "situational comedy funny moments sitcom clips"},
        {"sub": "satire", "query": "satire comedy roast show spoof humor parody"},
        {"sub": "improv", "query": "improv comedy prank humor street comedy"},
    ],
    "tech": [
        {"sub": "ai", "query": "artificial intelligence machine learning robotics neural networks"},
        {"sub": "hardware", "query": "pc build hardware tech teardown custom pc laptop"},
        {"sub": "coding", "query": "software engineering programming computer science developer"},
        {"sub": "gadgets", "query": "flagship gadget comparison technology future consumer tech"},
        {"sub": "cybersecurity", "query": "cybersecurity ethical hacking privacy computer networks"},
    ],
    "gaming": [
        {"sub": "esports", "query": "esports tournament championship finals highlights pro"},
        {"sub": "walkthrough", "query": "story gameplay walkthrough narrative open world"},
        {"sub": "gamedev", "query": "game development unreal engine 5 indie games showcase"},
        {"sub": "retro", "query": "retro gaming classic console arcade gaming history"},
        {"sub": "multiplayer", "query": "multiplayer funny gaming moments clips co op"},
    ],
    "food": [
        {"sub": "streetfood", "query": "street food night market authentic local culinary"},
        {"sub": "recipes", "query": "restaurant cooking recipes masterclass chef techniques"},
        {"sub": "baking", "query": "baking pastry artisan chocolate dessert crafting"},
        {"sub": "cultural", "query": "village cooking cultural traditional food documentary"},
    ],
    "sports": [
        {"sub": "highlights", "query": "sports highlights match moments tournament"},
        {"sub": "cricket", "query": "cricket match highlights wickets sixes full match"},
        {"sub": "football", "query": "football soccer goals match highlights premier league"},
        {"sub": "extreme", "query": "extreme sports stunts red bull action adventure"},
        {"sub": "combat", "query": "ufc boxing mma fight highlights knockout"},
    ],
    "movies": [
        {"sub": "trailers", "query": "official movie teaser trailer cinema release upcoming"},
        {"sub": "breakdowns", "query": "film analysis scene breakdown cinematography direction"},
        {"sub": "bts", "query": "behind the scenes making of VFX CGI movie production"},
        {"sub": "shortfilms", "query": "award winning short film cinema drama narrative"},
    ],
    "music": [
        {"sub": "indie", "query": "indie acoustic live acoustic performance studio session"},
        {"sub": "pop_rock", "query": "official music video rock pop hits"},
        {"sub": "electronic", "query": "electronic synthwave edm ambient production"},
        {"sub": "lofi", "query": "lofi hip hop instrumental chill beats"},
    ],
}

CATEGORY_QUERIES: Dict[str, Optional[str]] = {
    "all": None,
    "gaming": "gaming gameplay walkthrough esports live",
    "tech": "technology gadgets smartphone AI review unboxing",
    "movies": "movie trailer official clips cinema teaser",
    "music": "official music video new songs hits audio",
    "science": "science documentary astronomy physics technology",
    "sports": "sports highlights cricket football match moments",
    "comedy": "stand up comedy humor sketch comedy",
    "food": "street food cooking recipes food travel vlog",
    "trending": None,
}

TOPIC_CATEGORIES: Dict[str, List[str]] = {
    "all": [
        "Trending now India", "Gaming highlights 2026", "Tech gadgets and reviews",
        "New movie trailers 2026", "Science and space discoveries", "Cricket match highlights",
        "Bollywood hits 2026", "Standup comedy Hindi", "Travel street food India",
        "BBC Earth wildlife 4K", "GTA 6 gameplay", "AI robotics inventions 2026",
        "New Hindi songs 2026", "SpaceX starship launch", "Minecraft survival build 4K",
        "Hollywood upcoming movies", "Football champions league goals", "Unreal Engine 5 games",
        "Latest smartphone unboxing 2026", "Funny comedy sketches Hindi", "Japan travel vlog 4K",
        "James Webb telescope discoveries", "Arijit Singh live concert", "Supercars acceleration sound 4K",
        "Cyberpunk 2077 ray tracing", "World news today live", "Deep sea ocean creatures 4K",
        "Top global music hits", "Formula 1 race recap", "Anime new season teaser",
        "Best laptops 2026 review", "Wilderness bushcraft cooking", "Quantum computing breakthrough",
        "BGMI esports championship", "Nature relaxing 4K drone", "Ancient civilizations history 4K",
        "IPL best moments", "Electric vehicles future cars", "Apple keynote highlights",
        "Lo-fi hip hop study relax", "Behind the scenes movie VFX", "Best street food world tour",
        "PlayStation 5 top games", "Smart home gadgets 2026", "Viral comedy scenes",
        "Coke Studio top tracks", "Olympic records highlights", "Futuristic technology 2026",
    ],
    "gaming": [
        "Gaming highlights 2026", "GTA 6 gameplay", "Minecraft survival build 4K",
        "BGMI esports championship", "Elden Ring gameplay 4K", "Cyberpunk 2077 ray tracing",
        "Call of Duty Warzone epic moments", "PlayStation 5 top games", "Unreal Engine 5 games",
    ],
    "tech": [
        "Tech gadgets and reviews", "New smartphone unboxing 2026", "AI robotics inventions 2026",
        "SpaceX starship launch", "Quantum computing breakthrough", "Best laptops 2026 review",
        "Electric vehicles future cars", "Apple keynote highlights", "Smart home gadgets 2026",
    ],
    "movies": [
        "New movie trailers 2026", "Bollywood blockbuster trailer", "Hollywood upcoming movies",
        "Anime new season teaser", "Behind the scenes movie VFX", "Cinema film reviews 2026",
        "Sci-fi movies 2026 trailers", "Action movies best scenes 4K",
    ],
    "music": [
        "Bollywood hits 2026", "New Hindi songs 2026", "Top global music hits",
        "Arijit Singh live concert", "Acoustic chill live session", "Punjabi new hits 2026",
        "Lo-fi hip hop study relax", "Coke Studio top tracks", "Electronic music festival 4K",
    ],
    "science": [
        "Science and space discoveries", "BBC Earth wildlife 4K", "James Webb telescope discoveries",
        "Deep sea ocean creatures 4K", "How universe works 4K", "National Geographic adventure",
        "Nature relaxing 4K drone", "Ancient civilizations history 4K",
    ],
    "sports": [
        "Cricket match highlights", "IPL best moments", "Football champions league goals",
        "World cup best moments", "Olympic records highlights", "Formula 1 race recap",
    ],
    "comedy": [
        "Standup comedy Hindi", "Funny comedy sketches Hindi", "Viral comedy scenes",
        "Late night comedy show", "Best sitcom moments", "Prank funny video compilation",
    ],
    "food": [
        "Travel street food India", "Japan travel vlog 4K", "Wilderness bushcraft cooking",
        "Best street food world tour", "Luxury travel destinations", "Village cooking channel",
    ],
}

PAGE_MODIFIERS: List[str] = [
    "",
    "latest 2026",
    "breakthroughs",
    "popular highlights",
    "deep dive",
    "documentary",
    "analysis",
]


def get_page_modified_query(base_query: str, page: int) -> str:
    """Mutates query across deep pages to prevent search pagination collapse and duplicate video IDs."""
    if page <= 1:
        return base_query
    mod = PAGE_MODIFIERS[(page - 1) % len(PAGE_MODIFIERS)]
    return f"{base_query} {mod}".strip() if mod else base_query
