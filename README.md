# HTML Snake Game

A browser-based Snake game built entirely in a single `index.html` file.

## About

This project is a proof of concept demonstrating the use of [Claude Code](https://claude.ai/claude-code) — Anthropic's AI-powered CLI — to build a functional, polished HTML game through natural language conversation. No code was written by hand. Every feature was implemented by describing it to Claude Code and iterating on the result.

The goal was to see how far a single-file browser game could be taken using only conversational prompts, and how well Claude Code could handle incremental feature additions, UI polish, and game logic without losing context or introducing regressions.

## Features

- Classic snake gameplay with WASD and arrow key controls
- **Skin selection** — choose a snake color between runs, with a random color assigned on each page load
- **Two-color theming** — each skin has a close complementary accent color that drives the scoreboard numbers, leaderboard title, and modal styling
- **Leaderboard** — top 10 scores stored in `localStorage`, with each player's name rendered in their snake color
- **Score persistence** — optionally link a local `scores.json` file via the File System Access API for scores that survive browser clears
- **High score modal** — prompts for a name entry when a qualifying score is achieved
- Grid dot background, glow effects, and game-over overlay

## How It Was Built

The entire game was built incrementally through Claude Code prompts in a single conversation:

1. Started with a basic snake canvas game
2. Added a leaderboard with `localStorage` and optional `scores.json` file linking
3. Added a pre-game skin selection overlay with color swatches
4. Iterated on the skin system — random color on load, COLOR button between runs, hidden during active gameplay
5. Added complementary accent colors tied to each skin, applied across all UI elements
6. Added player color saved alongside leaderboard entries

## Running It

No build step or server required. Just open `index.html` in a browser.

```
open index.html
```

> Note: The File System Access API (for `scores.json` linking) requires Chrome or Edge.
