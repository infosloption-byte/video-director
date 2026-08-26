import type { Project } from "./types";
import { SEED_TOPICS } from "./topics";
import { matchVisuals } from "./visuals";

const topic = SEED_TOPICS[0];

export const SAMPLE_PROJECT: Project = {
  id: "sample-quantum-sensors",
  createdAt: "2026-08-26T00:00:00.000Z",
  status: "ready",
  topic,
  framework: "how_it_works",
  frameworkReasoning:
    "The source is a step-by-step mechanism. How It Works beats a hot take — people will save a mechanism they can repeat.",
  title: "How quantum GPS actually works",
  hookType: "negative_warning",
  hookReasoning:
    "Opens by attacking a belief everyone holds (phones need satellites) — a pattern interrupt in under 3 seconds.",
  seoCaption:
    "Quantum sensors are learning to navigate without GPS satellites. Here’s how cold atoms replace a sky view — and why your phone might not need orbiting clocks. #Quantum #TechNews #GPS #Physics",
  firstComment:
    "The UK ship trial kept a lock for hours after GPS was denied. Drift still exists — it’s an inertial sensor, not magic. Source: Nature Physics coverage of cold-atom accelerometers.",
  debateQuestion:
    "Would you trust a phone that never needs GPS satellites?",
  keywords: ["Quantum sensors", "GPS", "Physics", "Tech News", "Navigation"],
  voiceDirection:
    "Urgent, curious, no lecture voice. 1.1x pace. Pause a beat before the debate question.",
  voiceId: "helix",
  scenes: [
    {
      sceneOrder: 1,
      durationSeconds: 3,
      spokenText: "Everything you know about GPS is about to change.",
      onScreenText: "GPS is about to change",
      scriptReasoning:
        "Negative-warning hook. One sentence, under 3 seconds, no hello.",
      brollSearchTerm: "satellite orbit earth",
      visualReasoning:
        "A satellite over Earth puts high-tech context on screen in the first 1.5 seconds.",
      visuals: matchVisuals("satellite orbit earth", 5),
      selectedIndex: 0,
    },
    {
      sceneOrder: 2,
      durationSeconds: 6,
      spokenText:
        "Your phone begs satellites for a location. Tunnels, cities, and jammers all kill the signal.",
      onScreenText: "Satellites can be jammed",
      scriptReasoning:
        "Name the pain fast. Relatable failure modes make people want the mechanism.",
      brollSearchTerm: "phone city tunnel",
      visualReasoning:
        "Cut from orbit to a phone — the product the viewer actually carries.",
      visuals: matchVisuals("phone city tunnel", 5),
      selectedIndex: 0,
    },
    {
      sceneOrder: 3,
      durationSeconds: 8,
      spokenText:
        "Quantum sensors freeze atoms near absolute zero, then split them with lasers like a super-precise spirit level.",
      onScreenText: "Cold atoms, laser pulses",
      scriptReasoning:
        "One analogy. No ‘interferometry’ until the picture is already in their head.",
      brollSearchTerm: "lab laser physics",
      visualReasoning:
        "Lab glass and equations stand in for the vacuum chamber without looking like a lecture slide.",
      visuals: matchVisuals("lab laser physics", 5),
      selectedIndex: 0,
    },
    {
      sceneOrder: 4,
      durationSeconds: 7,
      spokenText:
        "Motion shifts the atoms. The chip reads that shift — no sky view required.",
      onScreenText: "No sky view required",
      scriptReasoning:
        "Close the mechanism. This is the line people will repeat in comments.",
      brollSearchTerm: "circuit chip hardware",
      visualReasoning:
        "Macro silicon implies this can leave the lab, which is the actual story.",
      visuals: matchVisuals("circuit chip hardware", 5),
      selectedIndex: 0,
    },
    {
      sceneOrder: 5,
      durationSeconds: 6,
      spokenText:
        "Ships already trialled it. Phones are the decade question — cost, size, and drift.",
      onScreenText: "Ships now. Phones next?",
      scriptReasoning:
        "Future impact without a fake launch date. Honesty reads as authority.",
      brollSearchTerm: "earth night network",
      visualReasoning:
        "A global night-Earth shot sells ‘everywhere’ without a stock battleship.",
      visuals: matchVisuals("earth night network", 5),
      selectedIndex: 0,
    },
    {
      sceneOrder: 6,
      durationSeconds: 4,
      spokenText: "Would you trust a phone that never needs GPS satellites?",
      onScreenText: "Would you trust it?",
      scriptReasoning:
        "Debate CTA. Meta pays for comments, not follows.",
      brollSearchTerm: "phone mobile",
      visualReasoning:
        "End on the object they already own so the question feels personal.",
      visuals: matchVisuals("phone mobile", 5),
      selectedIndex: 0,
    },
  ],
};
