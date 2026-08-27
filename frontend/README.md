# Helix — Science & Tech Auto-Director

A pixel-faithful React recreation of the Helix UI: a dark, editorial-serif themed app
for turning trending science/tech signals into directed short-form video reels.

## What's included

- **Signals page** (`/`) — hero, filterable "Today's signals" list, with a
  featured signal card and a 2-column grid below it.
- **Storyboard page** (`/storyboard/:id`) — a 9:16 video preview mock with
  live captions/play state, a HOOK explainer, and a scrollable list of story
  beats, each with script reasoning ("WHY THIS LINE" / "WHY THIS PICTURE")
  and a swappable set of 5 prefetched visual thumbnails.
- Two working example reels: `quantum-gps` and `solid-state`, reachable by
  clicking **Direct this Reel** on the first two signal cards.

## Stack

- React 19 + Vite
- react-router-dom for the two routes
- Plain CSS (design tokens in `src/index.css`, no CSS framework)
- Google Fonts: Newsreader (serif display), Inter (UI), IBM Plex Mono (labels)

## Run it

    npm install
    npm run dev       # http://localhost:5173

## Build for production

    npm run build
    npm run preview   # serves the dist/ build

## Project structure

    src/
      components/       Header, SignalCard, StepCard, PhonePreview, Icons, shared ui.css
      pages/            SignalsPage, StoryboardPage (+ styles)
      data/signals.js   Mock signal + storyboard content
      index.css         Design tokens (colors, type, radii) + resets

All data is mocked in `src/data/signals.js` — swap it for a real API by
replacing that module's exports.
