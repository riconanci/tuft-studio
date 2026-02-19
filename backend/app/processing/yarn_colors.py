"""
Tuft Studio — Standard Yarn Color Palette

~55 colors covering the common range available from major tufting yarn
suppliers (Tuftingpal, The Tufting Studio, Lenzing, etc.)

Organized by color family. Each entry is (name, R, G, B).
"""

YARN_PALETTE = [
    # ── Whites & Creams ──
    ("Snow White",        255, 255, 255),
    ("Ivory",             255, 248, 231),
    ("Cream",             245, 237, 215),
    ("Eggshell",          240, 234, 214),

    # ── Grays ──
    ("Silver",            192, 192, 192),
    ("Ash Gray",          160, 160, 160),
    ("Slate",             128, 128, 128),
    ("Charcoal",          64,  64,  64),
    ("Graphite",          40,  40,  40),

    # ── Blacks ──
    ("Black",             15,  15,  15),
    ("Jet Black",         5,   5,   5),

    # ── Browns & Tans ──
    ("Sand",              210, 190, 155),
    ("Tan",               190, 165, 122),
    ("Camel",             175, 140, 90),
    ("Mocha",             130, 95,  65),
    ("Chocolate",         90,  60,  35),
    ("Espresso",          55,  35,  20),
    ("Walnut",            70,  45,  25),

    # ── Reds ──
    ("Blush",             230, 180, 175),
    ("Coral",             230, 120, 100),
    ("Tomato Red",        210, 60,  45),
    ("Crimson",           175, 30,  30),
    ("Burgundy",          115, 25,  35),
    ("Wine",              90,  20,  30),

    # ── Oranges ──
    ("Peach",             245, 195, 155),
    ("Tangerine",         235, 140, 60),
    ("Burnt Orange",      200, 100, 35),
    ("Rust",              170, 75,  30),
    ("Terracotta",        190, 100, 65),

    # ── Yellows ──
    ("Butter",            250, 235, 170),
    ("Lemon",             245, 220, 80),
    ("Mustard",           210, 175, 55),
    ("Gold",              195, 155, 45),
    ("Amber",             180, 130, 35),

    # ── Greens ──
    ("Mint",              175, 225, 185),
    ("Sage",              150, 175, 140),
    ("Olive",             110, 120, 60),
    ("Forest",            45,  80,  45),
    ("Hunter Green",      30,  65,  35),
    ("Emerald",           40, 120,  70),
    ("Teal",              50, 130, 130),

    # ── Blues ──
    ("Baby Blue",         170, 205, 235),
    ("Sky Blue",          120, 175, 220),
    ("Denim",             80,  120, 170),
    ("Royal Blue",        45,  70,  155),
    ("Navy",              25,  35,  80),
    ("Midnight",          20,  25,  55),
    ("Powder Blue",       160, 190, 210),

    # ── Purples ──
    ("Lavender",          185, 170, 210),
    ("Lilac",             170, 140, 190),
    ("Plum",              110, 50,  100),
    ("Eggplant",          65,  30,  65),
    ("Mauve",             175, 130, 155),

    # ── Pinks ──
    ("Pale Pink",         245, 210, 210),
    ("Rose",              220, 140, 150),
    ("Hot Pink",          220, 70,  120),
    ("Magenta",           180, 45,  110),
    ("Dusty Rose",        195, 145, 145),
]

# Pre-computed numpy array for fast distance calculations
import numpy as np

YARN_PALETTE_RGB = np.array(
    [[r, g, b] for (_, r, g, b) in YARN_PALETTE],
    dtype=np.uint8,
)

YARN_PALETTE_NAMES = [name for (name, _, _, _) in YARN_PALETTE]
