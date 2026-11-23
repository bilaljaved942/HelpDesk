"""The demo store's product catalogue (invented). seed.py loads it into the products table."""

CATEGORIES = {
    "jackets": "Jackets",
    "footwear": "Footwear",
    "packs": "Packs",
    "tents": "Tents",
    "accessories": "Accessories",
}

PRODUCTS = [
    {
        "slug": "ridgeline-waterproof-jacket", "name": "Ridgeline Waterproof Jacket", "category": "jackets",
        "price": 189.0, "compare_at": None, "art": "jacket", "bg": "#e4ece7", "rating": 4.8, "reviews": 412,
        "badge": "Best seller", "is_new": False,
        "sizes": ["S", "M", "L", "XL", "XXL"],
        "colors": [{"name": "Pine", "hex": "#2d6a52"}, {"name": "Slate blue", "hex": "#2f4a6b"}, {"name": "Rust", "hex": "#b4532a"}],
        "description": "A fully waterproof, breathable shell for rain that doesn't stop. Taped seams, a storm hood "
                       "that fits over a helmet and pit zips for steep climbs.",
        "features": ["3-layer waterproof membrane (20,000 mm)", "Adjustable storm hood", "Pit zips for venting",
                     "Athletic fit: size up to layer a fleece underneath", "Lifetime warranty"],
    },
    {
        "slug": "summit-down-jacket", "name": "Summit Down Jacket", "category": "jackets",
        "price": 199.0, "compare_at": 249.0, "art": "down", "bg": "#e3e8ef", "rating": 4.9, "reviews": 156,
        "badge": "Sale", "is_new": True,
        "sizes": ["S", "M", "L", "XL"],
        "colors": [{"name": "Midnight", "hex": "#33507a"}, {"name": "Black", "hex": "#1f1f1f"}, {"name": "Red", "hex": "#a33a2b"}],
        "description": "Warm, light and packable. 800-fill responsibly sourced down keeps you warm on cold summit "
                       "mornings and packs into its own pocket.",
        "features": ["800-fill RDS-certified down", "Packs into its own pocket", "Water-repellent shell",
                     "Weighs 390 g (size M)", "Lifetime warranty"],
    },
    {
        "slug": "basecamp-fleece", "name": "Basecamp Fleece", "category": "jackets",
        "price": 79.0, "compare_at": None, "art": "fleece", "bg": "#ece4e1", "rating": 4.5, "reviews": 97,
        "badge": None, "is_new": True,
        "sizes": ["S", "M", "L", "XL"],
        "colors": [{"name": "Clay", "hex": "#8c4a3c"}, {"name": "Moss", "hex": "#5d6b4a"}, {"name": "Navy", "hex": "#2f4a6b"}],
        "description": "A soft recycled fleece mid-layer with a half zip. Wear it on its own on cool days or under a shell.",
        "features": ["100% recycled polyester fleece", "Half zip with chin guard", "Zipped chest pocket"],
    },
    {
        "slug": "trailhead-hiking-boots", "name": "Trailhead Hiking Boots", "category": "footwear",
        "price": 159.0, "compare_at": None, "art": "boots", "bg": "#efe7dd", "rating": 4.6, "reviews": 288,
        "badge": "Runs ½ size small", "is_new": False,
        "sizes": ["7", "8", "8.5", "9", "9.5", "10", "10.5", "11", "12"],
        "colors": [{"name": "Brown", "hex": "#7a5232"}, {"name": "Charcoal", "hex": "#3d3d3d"}],
        "description": "Waterproof leather boots with a grippy lugged sole for rocky trails. They run half a size "
                       "small: we recommend ordering half a size up.",
        "features": ["Waterproof nubuck leather", "Vibram-style lugged outsole", "Cushioned EVA midsole",
                     "Runs half a size small", "1-year warranty"],
    },
    {
        "slug": "swift-trail-runners", "name": "Swift Trail Runners", "category": "footwear",
        "price": 129.0, "compare_at": None, "art": "runners", "bg": "#e6e9ee", "rating": 4.4, "reviews": 141,
        "badge": None, "is_new": True,
        "sizes": ["7", "8", "9", "10", "11", "12"],
        "colors": [{"name": "Glacier", "hex": "#3f6f9a"}, {"name": "Ember", "hex": "#c0532d"}],
        "description": "Light, fast trail shoes with a rock plate and sticky rubber. True to size.",
        "features": ["Breathable mesh upper", "Rock plate", "6 mm drop", "True to size", "1-year warranty"],
    },
    {
        "slug": "alpine-30l-backpack", "name": "Alpine 30L Backpack", "category": "packs",
        "price": 139.0, "compare_at": None, "art": "pack", "bg": "#eeeadb", "rating": 4.7, "reviews": 203,
        "badge": None, "is_new": False,
        "sizes": ["One size"],
        "colors": [{"name": "Mustard", "hex": "#9a7a2a"}, {"name": "Pine", "hex": "#2d6a52"}],
        "description": "A 30-litre day pack with a ventilated back panel, hip belt and rain cover for long days out.",
        "features": ["30 L capacity", "Ventilated back panel", "Built-in rain cover", "Hydration sleeve", "Lifetime warranty"],
    },
    {
        "slug": "pine-two-person-tent", "name": "Pine Two-Person Tent", "category": "tents",
        "price": 299.0, "compare_at": None, "art": "tent", "bg": "#e6ece2", "rating": 4.7, "reviews": 64,
        "badge": "Lifetime warranty", "is_new": False,
        "sizes": ["One size"],
        "colors": [{"name": "Amber", "hex": "#d08a2e"}, {"name": "Forest", "hex": "#3f6b4a"}],
        "description": "A freestanding three-season tent for two, with two doors, two porches and a 15-minute pitch.",
        "features": ["Sleeps 2", "Weighs 1.9 kg", "Two doors and two porches", "Colour-coded poles", "Lifetime warranty"],
    },
    {
        "slug": "canyon-hiking-trousers", "name": "Canyon Hiking Trousers", "category": "accessories",
        "price": 89.0, "compare_at": None, "art": "trousers", "bg": "#e9e6dc", "rating": 4.3, "reviews": 77,
        "badge": None, "is_new": False,
        "sizes": ["30 short", "30 regular", "32 regular", "32 long", "34 regular", "34 long"],
        "colors": [{"name": "Stone", "hex": "#8a7f66"}, {"name": "Graphite", "hex": "#4a4d52"}],
        "description": "Stretchy, quick-drying trousers that move with you on scrambles. Short, regular and long legs.",
        "features": ["4-way stretch", "Quick-drying", "Zipped thigh pocket", "Short (30\"), regular (32\"), long (34\") legs"],
    },
    {
        "slug": "merino-hiking-socks", "name": "Merino Hiking Socks (3-pack)", "category": "accessories",
        "price": 34.0, "compare_at": None, "art": "socks", "bg": "#efe6e6", "rating": 4.8, "reviews": 326,
        "badge": None, "is_new": False,
        "sizes": ["M", "L"],
        "colors": [{"name": "Heather", "hex": "#7a6a8a"}, {"name": "Oat", "hex": "#b8a483"}],
        "description": "Cushioned merino wool socks that stay warm when wet and don't smell. Pack of three. "
                       "(Socks cannot be returned for hygiene reasons.)",
        "features": ["70% merino wool", "Cushioned sole", "Pack of 3", "Final sale: not returnable"],
    },
]

BY_SLUG = {p["slug"]: p for p in PRODUCTS}

# Shipping prices come from the shipping policy (seed/docs/shipping.md).
SHIPPING = {
    "standard": {"label": "Standard (4–6 business days)", "price": 6.95, "days": 6, "carrier": "USPS"},
    "express": {"label": "Express (2–3 business days)", "price": 14.95, "days": 3, "carrier": "UPS"},
    "next-day": {"label": "Next day (1 business day)", "price": 29.95, "days": 1, "carrier": "FedEx"},
}
FREE_STANDARD_OVER = 75.0
INTERNATIONAL = {"Canada", "United Kingdom", "Australia", "Germany", "France", "Ireland", "Netherlands", "Spain", "Italy"}
INTERNATIONAL_PRICE = 24.95


def shipping_cost(method: str, subtotal: float, country: str) -> float:
    if country != "United States":
        return INTERNATIONAL_PRICE
    if method == "standard" and subtotal >= FREE_STANDARD_OVER:
        return 0.0
    return SHIPPING[method]["price"]
