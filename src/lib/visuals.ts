import type { Visual } from "./types";

const u = (id: string, extra = "") =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1080&h=1920&q=80${extra}`;

export const VISUAL_LIBRARY: Visual[] = [
  {
    id: "earth-orbit",
    url: u("photo-1446776877081-d282a7f57e85"),
    alt: "Earth from orbit",
    tags: ["earth", "orbit", "space", "planet", "nasa", "satellite", "gps"],
    color: "#0b1c33",
  },
  {
    id: "galaxy",
    url: u("photo-1462331940025-496dfbfc7564"),
    alt: "Deep space galaxy",
    tags: ["galaxy", "space", "stars", "cosmos", "physics", "quantum"],
    color: "#12081c",
  },
  {
    id: "astronaut",
    url: u("photo-1446776811953-b23d57bd21aa"),
    alt: "Earth atmosphere from space",
    tags: ["astronaut", "space", "nasa", "orbit", "earth"],
    color: "#0a1528",
  },
  {
    id: "satellite",
    url: u("photo-1446776653964-20c1d3a81b06"),
    alt: "Satellite over Earth",
    tags: ["satellite", "gps", "orbit", "navigation", "space"],
    color: "#101820",
  },
  {
    id: "lab-glass",
    url: u("photo-1532094349884-543bc11b234d"),
    alt: "Laboratory glassware",
    tags: ["lab", "science", "chemistry", "research", "experiment"],
    color: "#1a1410",
  },
  {
    id: "microscope",
    url: u("photo-1576086213369-97a306d36557"),
    alt: "Scientist at a microscope",
    tags: ["microscope", "lab", "biology", "cells", "research", "biotech"],
    color: "#141414",
  },
  {
    id: "circuit",
    url: u("photo-1518770660439-4636190af475"),
    alt: "Circuit board close-up",
    tags: ["chip", "circuit", "hardware", "electronics", "ai", "computer"],
    color: "#0d1a14",
  },
  {
    id: "server",
    url: u("photo-1558494949-ef010cbdcc31"),
    alt: "Data center racks",
    tags: ["server", "data", "ai", "compute", "cloud", "network"],
    color: "#0c1210",
  },
  {
    id: "robot",
    url: u("photo-1485827404703-89b55fcc595e"),
    alt: "Humanoid robot",
    tags: ["robot", "robotics", "ai", "hardware", "machine"],
    color: "#161616",
  },
  {
    id: "solar",
    url: u("photo-1509391366360-2e959784a276"),
    alt: "Solar panel array",
    tags: ["solar", "energy", "power", "climate", "grid"],
    color: "#1a1a12",
  },
  {
    id: "powerlines",
    url: u("photo-1473341304170-971dccb5ac1e"),
    alt: "High-voltage power lines",
    tags: ["power", "grid", "energy", "electric", "infrastructure"],
    color: "#12100c",
  },
  {
    id: "dna",
    url: u("photo-1530026405186-ed1f139313f8"),
    alt: "DNA helix render",
    tags: ["dna", "gene", "crispr", "biotech", "genome", "biology"],
    color: "#101418",
  },
  {
    id: "brain",
    url: u("photo-1559757175-5700dde675bc"),
    alt: "Brain scan lighting",
    tags: ["brain", "neural", "neuroscience", "bci", "medicine"],
    color: "#1a1014",
  },
  {
    id: "ev",
    url: u("photo-1593941707882-a5bba14938c7"),
    alt: "Electric car charging",
    tags: ["ev", "car", "battery", "electric", "energy", "vehicle"],
    color: "#101010",
  },
  {
    id: "code",
    url: u("photo-1555066931-4365d14bab8c"),
    alt: "Code on a monitor",
    tags: ["code", "software", "ai", "model", "open-source", "computer"],
    color: "#0c0c0c",
  },
  {
    id: "math",
    url: u("photo-1635070041078-e363dbe005cb"),
    alt: "Chalkboard equations",
    tags: ["math", "physics", "quantum", "theory", "formula"],
    color: "#0e1218",
  },
  {
    id: "surgery",
    url: u("photo-1551076805-e1869033e561"),
    alt: "Operating room lights",
    tags: ["surgery", "hospital", "medicine", "ai", "doctor"],
    color: "#141010",
  },
  {
    id: "chip-macro",
    url: u("photo-1518773553398-650c184e0bb3"),
    alt: "Silicon chip macro",
    tags: ["chip", "semiconductor", "hardware", "neuromorphic", "processor"],
    color: "#101414",
  },
  {
    id: "night-sky",
    url: u("photo-1444703686981-a3abbc4d4fe3"),
    alt: "Milky Way over a ridge",
    tags: ["sky", "stars", "space", "telescope", "night"],
    color: "#080810",
  },
  {
    id: "wind",
    url: u("photo-1466611653911-95081537e5b7"),
    alt: "Wind turbines",
    tags: ["wind", "energy", "climate", "turbine", "grid"],
    color: "#101820",
  },
  {
    id: "cells",
    url: u("photo-1579154204601-01588f351e67"),
    alt: "Petri dishes",
    tags: ["cells", "lab", "biotech", "culture", "medicine"],
    color: "#12100e",
  },
  {
    id: "datacenter",
    url: u("photo-1544197150-b99a5804e22e"),
    alt: "Server corridor",
    tags: ["data", "ai", "compute", "server", "cluster"],
    color: "#0a1014",
  },
  {
    id: "neural-net",
    url: u("photo-1620712943543-bcc4688e7485"),
    alt: "Abstract neural network",
    tags: ["ai", "neural", "model", "network", "machine"],
    color: "#0c1020",
  },
  {
    id: "moon",
    url: u("photo-1522030299830-16b8d3d049fe"),
    alt: "Moon surface lighting",
    tags: ["moon", "space", "nasa", "lunar", "planet"],
    color: "#121210",
  },
  {
    id: "scientist",
    url: u("photo-1507413245164-6160d14998b5"),
    alt: "Researcher in a lab coat",
    tags: ["scientist", "lab", "research", "people", "experiment"],
    color: "#141414",
  },
  {
    id: "phone",
    url: u("photo-1511707171634-5f897ff02aa9"),
    alt: "Smartphone in hand",
    tags: ["phone", "mobile", "app", "gps", "consumer"],
    color: "#101014",
  },
  {
    id: "laser",
    url: u("photo-1451187580459-43490279c0fa"),
    alt: "Earth at night from space",
    tags: ["earth", "night", "city", "network", "global"],
    color: "#080c18",
  },
  {
    id: "battery-lab",
    url: u("photo-1581091226825-a6a2a5aee158"),
    alt: "Engineer working on hardware",
    tags: ["engineer", "battery", "lab", "hardware", "prototype"],
    color: "#121416",
  },
  {
    id: "fusion",
    url: u("photo-1614728894747-a83421e2b9c9"),
    alt: "Planetary surface render",
    tags: ["plasma", "fusion", "planet", "energy", "physics"],
    color: "#1a0c0c",
  },
  {
    id: "tunnel",
    url: u("photo-1486325212027-8081e485255e"),
    alt: "Modern tunnel interior",
    tags: ["tunnel", "car", "navigation", "gps", "city"],
    color: "#101010",
  },
];

function tokenize(term: string) {
  return term
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

export function matchVisuals(term: string, count = 5): Visual[] {
  const words = tokenize(term);
  const scored = VISUAL_LIBRARY.map((visual) => {
    let score = 0;
    for (const tag of visual.tags) {
      for (const word of words) {
        if (tag === word) score += 4;
        else if (tag.includes(word) || word.includes(tag)) score += 2;
      }
    }
    return { visual, score };
  }).sort((a, b) => b.score - a.score);

  const picked: Visual[] = [];
  for (const row of scored) {
    if (picked.length >= count) break;
    picked.push(row.visual);
  }
  if (picked.length < count) {
    for (const visual of VISUAL_LIBRARY) {
      if (picked.length >= count) break;
      if (!picked.some((p) => p.id === visual.id)) picked.push(visual);
    }
  }
  return picked;
}
