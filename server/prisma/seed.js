// Seeds `signals` with hand-written rows for local dev (M0 — TASK.md).
// The first four are ported straight from the frontend's old mock data
// (frontend/src/data/signals.js) so SignalsPage renders identical content
// once it switches from the mock import to a real fetch(). Two more are
// added to round out the set per TASK.md's "5-10 rows" target.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const rows = [
  {
    // Explicit id (not the default uuid()) so it keeps matching the
    // frontend's existing mocked storyboard data (src/data/signals.js →
    // storyboards["quantum-gps"]) until M3 wires real project creation.
    id: "quantum-gps",
    origin: "suggested",
    sourceType: "rss",
    sourceReliability: "peer_reviewed",
    rank: 1,
    category: "PHYSICS",
    heatPct: "+380%",
    heatScore: 380,
    title: "Quantum sensors that navigate without GPS",
    description:
      "Atom interferometers are leaving the lab. They measure acceleration so precisely a vehicle can dead-reckon through a tunnel without a satellite lock.",
    whyReasoning:
      "Ranked #1: 'quantum navigation' search volume is up 380% this week after a UK field trial on a Royal Navy ship.",
    sourceName: "Nature Physics",
    sourceUrl: "https://www.nature.com/nphys/",
    status: "new",
  },
  {
    id: "solid-state",
    origin: "suggested",
    sourceType: "rss",
    sourceReliability: "general_web",
    rank: 2,
    category: "ENERGY",
    heatPct: "+214%",
    heatScore: 214,
    title: "Solid-state cells that actually survive a crash test",
    description:
      "A sulfide electrolyte pack just held 80% capacity after 1,000 cycles and refused to ignite when a startup put a nail through it on camera.",
    whyReasoning:
      "Ranked #2: 'solid-state battery' chatter spiked after an independent lab confirmed the puncture test results.",
    sourceName: "IEEE Spectrum",
    sourceUrl: "https://spectrum.ieee.org/",
    status: "new",
  },
  {
    origin: "suggested",
    sourceType: "rss",
    sourceReliability: "peer_reviewed",
    rank: 3,
    category: "BIOTECH",
    heatPct: "+156%",
    heatScore: 156,
    title: "Lab-grown embryo models are rewriting week one",
    description:
      "Stem-cell built structures are now modeling the first days after implantation without an egg or sperm cell in sight.",
    whyReasoning: "Ranked #3: coverage of a new Cell paper is climbing fast on science social feeds.",
    sourceName: "Cell",
    sourceUrl: "https://www.cell.com/",
    status: "new",
  },
  {
    origin: "suggested",
    sourceType: "rss",
    sourceReliability: "general_web",
    rank: 4,
    category: "HARDWARE",
    heatPct: "+98%",
    heatScore: 98,
    title: "A cooling chip with no moving parts and no coolant",
    description:
      "A thermoelectric stack pulled from satellite hardware is being repackaged to cool consumer chips passively at data-center density.",
    whyReasoning: "Ranked #4: 'passive cooling chip' is trending across hardware forums this week.",
    sourceName: "IEEE Spectrum",
    sourceUrl: "https://spectrum.ieee.org/",
    status: "new",
  },
  {
    origin: "suggested",
    sourceType: "hacker_news",
    sourceReliability: "ai_search",
    rank: 5,
    category: "AI",
    heatPct: "+312 pts",
    heatScore: 312,
    title: "A distillation trick shrinks a frontier model to run on a phone",
    description:
      "A reproducible recipe claims 90% of a flagship model's benchmark score at 1/20th the parameter count, running fully on-device.",
    whyReasoning: "Ranked #5: front-page Hacker News post, 312 points and climbing after 6 hours.",
    sourceName: "Hacker News",
    sourceUrl: "https://news.ycombinator.com/",
    status: "new",
  },
  {
    origin: "suggested",
    sourceType: "arxiv",
    sourceReliability: "peer_reviewed",
    rank: 6,
    category: "SPACE",
    heatPct: "New",
    heatScore: 40,
    title: "A cheaper way to spot exoplanet atmospheres from the ground",
    description:
      "A new spectroscopy technique claims ground-based telescopes can now pick up atmospheric signatures previously thought to need a space telescope.",
    whyReasoning: "Fresh arXiv preprint in astro-ph, ranked by recency + category match.",
    sourceName: "arXiv",
    sourceUrl: "https://arxiv.org/",
    status: "new",
  },
];

async function main() {
  console.log(`Seeding ${rows.length} signals...`);
  for (const data of rows) {
    await prisma.signal.create({ data });
  }
  console.log("Done.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
