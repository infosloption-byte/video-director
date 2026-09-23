import test from "node:test";
import assert from "node:assert/strict";
import { getPredefinedVoice, getPredefinedVoices, getPredefinedVoiceFilters } from "../src/services/predefinedVoiceService.js";

test("predefined narration catalog has stable selectable voices", () => {
  const voices = getPredefinedVoices();
  assert.equal(voices.length, 17);
  assert.equal(new Set(voices.map((voice) => voice.id)).size, voices.length);
  assert.equal(new Set(voices.map((voice) => voice.voiceId)).size, voices.length);
  assert.ok(voices.some((voice) => voice.accent === "American" && voice.gender === "Female"));
  assert.ok(voices.some((voice) => voice.accent === "American" && voice.gender === "Male"));
  assert.ok(voices.some((voice) => voice.accent === "British" && voice.gender === "Female"));
  assert.ok(voices.some((voice) => voice.accent === "British" && voice.gender === "Male"));
  assert.ok(voices.some((voice) => voice.tone === "Storytelling"));
});

test("predefined narration catalog resolves ids and filters", () => {
  assert.equal(getPredefinedVoice("kokoro-af-heart")?.voiceId, "af_heart");
  assert.equal(getPredefinedVoice("missing-voice"), null);

  const filters = getPredefinedVoiceFilters();
  assert.deepEqual(filters.accents, ["American", "British"]);
  assert.deepEqual(filters.genders, ["Female", "Male"]);
  assert.ok(filters.tones.includes("Warm"));
  assert.ok(filters.tones.includes("Storytelling"));
});
