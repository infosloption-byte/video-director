import type { Topic } from "./types";

export const SEED_TOPICS: Topic[] = [
  {
    id: "quantum-sensors",
    headline: "Quantum sensors that navigate without GPS",
    source: "Nature Physics",
    category: "Physics",
    blurb:
      "Atom interferometers are leaving the lab. They measure acceleration so precisely a vehicle can dead-reckon through a tunnel without a satellite lock.",
    trendReasoning:
      "Ranked #1: ‘quantum navigation’ search volume is up 380% this week after a UK field trial on a Royal Navy ship.",
    searchDelta: 380,
    suggestedFramework: "how_it_works",
    rawContent: `A new class of quantum inertial sensors uses cold-atom interferometry to measure acceleration and rotation without relying on GPS satellites. In a typical device, a cloud of atoms is laser-cooled to near absolute zero inside a vacuum chamber. A sequence of laser pulses splits the atomic wavefunction, lets the two paths accumulate a phase difference caused by acceleration, then recombines them. The interference pattern is a direct readout of motion.

Unlike a phone GPS chip, the sensor cannot be jammed by radio interference and does not need a sky view. That makes it useful for submarines, underground vehicles, and aircraft flying in contested airspace. Current lab systems are still rack-sized and expensive. The 2026 research push is miniaturisation: photonic integrated circuits to replace bulk lasers, and better vibration isolation so the device works on a moving platform.

A UK trial mounted a quantum accelerometer on a ship and kept a navigation lock for hours after GPS was denied. Error still grows with time — these are inertial sensors, not magic — but the drift is orders of magnitude slower than a consumer IMU. If chip-scale versions arrive, phones and cars could keep locating themselves in tunnels, dense cities, and indoor spaces where GPS currently dies.

The debate is not whether the physics works. It is whether the, cost, and supply chain can move this from defence labs into consumer hardware within a decade.`,
  },
  {
    id: "solid-state-batteries",
    headline: "Solid-state cells that actually survive a crash test",
    source: "Joule",
    category: "Energy",
    blurb:
      "A startup just published cycle-life data on a sulfide solid electrolyte pack that holds 80% capacity after 1,000 cycles — and does not ignite when pierced.",
    trendReasoning:
      "Trending: 290% spike after an OEM confirmed a 2028 vehicle program using the chemistry.",
    searchDelta: 290,
    suggestedFramework: "disruptor",
    rawContent: `Solid-state batteries replace the flammable liquid electrolyte in lithium-ion cells with a ceramic or sulfide solid. In theory this enables a lithium-metal anode, higher energy density, and a cell that does not catch fire when crushed. In practice, dendrites still punch through many solid electrolytes, and manufacturing yield has been poor.

A 2026 paper from a small materials team reports a sulfide electrolyte with a chloride doping trick that lowers interfacial resistance and suppresses dendrite growth at 2C charge rates. Pouch cells at 400 Wh/kg retained 80% capacity after 1,000 cycles at 25°C. Nail-penetration tests did not produce thermal runaway. The team’s pilot line is a fraction of the capex of a conventional gigafactory module.

Incumbent cell makers have spent billions on oxide and polymer routes with slower timelines. The disruptor claim is not that liquid lithium-ion is dead — it is that a focused materials bet can skip a generation of factory lock-in. Remaining bottlenecks: moisture sensitivity of sulfides, stack pressure in a real pack, and cold-weather power.

If the cycle-life numbers hold at automotive scale, range anxiety and fire headlines both change. If they do not, this joins a long list of solid-state demos that never left the press release.`,
  },
  {
    id: "ai-surgery",
    headline: "Would you let an AI hold the scalpel?",
    source: "The Lancet Digital Health",
    category: "AI",
    blurb:
      "A supervised surgical model matched senior residents on a standardised suturing bench test. The comments section is already a war zone.",
    trendReasoning:
      "High-debate signal: ‘AI surgery’ is the most-commented science topic on Facebook this week.",
    searchDelta: 240,
    suggestedFramework: "debunker",
    rawContent: `A research group trained a vision-action model on thousands of hours of laparoscopic video, then let it control a surgical robot on a benchtop suturing task. Under a human supervisor who could take over in under 200 milliseconds, the model matched the stitch quality of senior residents and was slower than attending surgeons.

This is not autonomous surgery in a living patient. The paper is explicit: no in-vivo trial, no regulatory clearance, and the model failed on rare tool-tissue configurations that a human notices instantly. Headlines that say ‘AI surgeons are here’ are wrong. Headlines that say ‘AI will never touch an operating room’ are also wrong.

The useful frame is levels of assistance. Today’s robots are teleoperated. Tomorrow’s may suggest a port placement, warn about a vessel, or complete a repetitive suture while the surgeon watches. Liability, dataset bias, and the cost of a failure in tissue are the real constraints — not whether a model can tie a knot on rubber.

The Facebook-ready question is the one that actually splits the audience: would you accept an AI completing a stitch on you if a human attending was in the room and legally responsible?`,
  },
  {
    id: "in-vivo-crispr",
    headline: "CRISPR that edits inside the body, not in a dish",
    source: "Science",
    category: "Biotech",
    blurb:
      "A lipid-nanoparticle prime editor reached the liver in non-human primates and corrected a disease mutation without cutting both DNA strands.",
    trendReasoning:
      "Biotech watch: 210% rise after a Phase 1 filing leaked into conference abstracts.",
    searchDelta: 210,
    suggestedFramework: "future_timeline",
    rawContent: `Prime editing is a CRISPR-derived method that writes new DNA sequences without making a double-strand break. Until recently it was mostly a dish technique: take cells out, edit, put them back. The hard problem is delivery — getting the editor to the right organ, in enough cells, without wrecking the liver or triggering an immune storm.

A 2026 primate study packaged a prime editor in lipid nanoparticles aimed at hepatocytes. A single infusion corrected a model of a metabolic disease mutation in a substantial fraction of liver cells, with off-target rates below the study’s detection threshold at the sites they checked. Animals were followed for months; liver enzymes spiked then normalised.

Year 1–2 is more animal data and conservative first-in-human trials for severe liver diseases where the risk/benefit is obvious. Year 5 is the first commercial liver indications if safety holds. Year 10 is the question mark: muscle, brain, and stem-cell niches need different delivery vehicles, and those are still research.

The ethical load is real. Germline editing is not this paper. Somatic liver editing is closer to a one-time drug. The public argument will still collapse those two into one word: CRISPR.`,
  },
  {
    id: "open-weight-lab",
    headline: "A 13B open model just beat a closed lab on a science bench",
    source: "arXiv",
    category: "AI",
    blurb:
      "A university team used synthetic textbooks and a clever test-time compute trick to outscore a proprietary model on GPQA-style science questions.",
    trendReasoning:
      "Developer chatter: 340% mention lift across AI forums in 48 hours.",
    searchDelta: 340,
    suggestedFramework: "disruptor",
    rawContent: `Closed frontier labs have argued that science-grade reasoning requires giant proprietary models and secret data. A 13-billion-parameter open-weight model trained by a small academic group just matched or beat a well-known closed model on a graduate-level science Q&A set.

The trick was not a new architecture. It was data and inference. They generated a large synthetic textbook corpus with heavy filtering, then at test time let the model spend more compute — sampling multiple chains and selecting with a verifier — instead of growing parameter count. Training cost was a rounding error compared with a frontier run.

This does not mean open models have ‘won’. On long-horizon tool use and messy real-world tasks, the closed labs still lead. It does mean the cost of a specialised science assistant is collapsing, and that a well-aimed 13B can be enough if you buy reasoning with compute at inference rather than with a 100B training run.

Why it matters for ordinary researchers: a lab without a cloud monopoly can now fine-tune a capable science model on its own papers and run it locally. The playing field is not equal. It is less vertical than it was 18 months ago.`,
  },
  {
    id: "fusion-hold",
    headline: "A tokamak held net-positive plasma for 22 minutes",
    source: "MIT Technology Review",
    category: "Energy",
    blurb:
      "Not ignition. Not a power plant. A duration record that moves fusion from flash-in-the-pan shots toward something that looks like an engine.",
    trendReasoning:
      "Evergreen spike: fusion headlines recycle every record. This one has staying power because it is about time, not a single shot.",
    searchDelta: 180,
    suggestedFramework: "future_timeline",
    rawContent: `Fusion needs more than a brief burst of more energy out than in. A power plant has to hold a burning plasma, extract heat, breed tritium, and survive neutron damage for years. A recent tokamak run held a net-positive plasma for 22 minutes — a duration record, not a commercial breakthrough.

What changed: better superconducting magnets, real-time plasma control with machine-learning shape controllers, and tungsten divertor materials that did not flake as fast. The device still consumed more facility power than it would send to a grid. Net-positive here is a plasma metric, not a wall-plug metric. That distinction is what most viral posts get wrong.

Year 1–2: more duration and higher duty cycle on existing machines. Year 5: pilot plants that attempt electricity on the grid in a demonstration sense, with huge asterisks around uptime. Year 10: if tritium breeding and materials survive, fusion becomes a serious climate tool. If they do not, we will have very expensive physics facilities.

The honest Reel is not ‘unlimited clean energy next year’. It is ‘the bottleneck moved from physics-of-the-shot to engineering-of-the-year’.`,
  },
  {
    id: "neuromorphic-chip",
    headline: "A neuromorphic chip that sips power like a brainstem",
    source: "IEEE Spectrum",
    category: "Hardware",
    blurb:
      "Event-driven silicon just ran a keyword-spotting model at milliwatts — low enough to live in an always-on wearable without a daily charge panic.",
    trendReasoning:
      "Hardware circle: 160% lift after a wearable OEM posted a teardown of a milliwatt always-on mic.",
    searchDelta: 160,
    suggestedFramework: "how_it_works",
    rawContent: `Conventional chips wake up on a clock, multiply matrices, and burn energy whether the world changed or not. Neuromorphic chips fire only when an event happens — a spike of sound, a pixel change, a sensor tick — more like a nervous system than a GPU.

A new accelerator pairs analog memory elements with a sparse spiking network. For a keyword-spotting task (‘hey device’), it ran continuously at a few milliwatts, versus hundreds of milliwatts for a tiny digital NPU doing the same job. Accuracy was close, not identical. The analog bits drift with temperature, so the chip includes a slow digital supervisor that recalibrates.

The catch: toolchains are immature, models must be rewritten as spikes, and yields on analog memory are still a manufacturing story. You will not train an LLM on this. You might finally have a watch or hearing aid that listens all day without becoming a brick at 4pm.

If the software stack catches up, always-on sensing stops being a battery tax. If it does not, neuromorphic remains a conference demo with beautiful energy charts.`,
  },
  {
    id: "direct-air-capture",
    headline: "A DAC plant that got cheaper by throwing out the sorbent myth",
    source: "Joule",
    category: "Energy",
    blurb:
      "A modular direct-air-capture design uses a different contact method and published a cost curve that undercuts the usual $600/ton shrug.",
    trendReasoning:
      "Climate-tech: 150% search rise after a offtake announcement from a steelmaker.",
    searchDelta: 150,
    suggestedFramework: "disruptor",
    rawContent: `Direct air capture pulls CO2 out of ambient air, which is hard because the concentration is about 420 parts per million. Most plants push air through fans over a sorbent, then heat the sorbent to release concentrated CO2. Energy and capex have kept costs high — often quoted around $400–800 per ton.

A new modular design changes the contact step: a liquid wash with a geometry that cuts fan power, and a heat-recovery loop that reuses the regeneration energy. Their published techno-economic analysis puts a nth-of-a-kind plant in the low hundreds of dollars per ton if cheap heat is available — geothermal or waste heat, not a gas boiler pretending to be green.

This does not replace cutting emissions. DAC is for the residual tons and the carbon that already escaped. The disruptor angle is industrial: a steel offtaker wants carbon-negative feedstock, not a climate TED talk. If modules can be factory-built like HVAC units, the learning curve looks more like solar than like a one-off cathedral plant.

Skepticism is warranted. Every DAC outfit has a beautiful cost curve. The only number that counts is tons delivered, verified, and paid for.`,
  },
];
