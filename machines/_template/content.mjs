// Reference machine copy. Every field is described in AGENTS.md, "content.mjs fields".
export default {
  slug: "_template",
  title: "Inside a cache",
  hook: "Why the second request is a hundred times faster.",
  level: "starter",
  minutes: 5,
  order: 999,
  track: "systems",
  bigIdea: "A cache trades a little memory for skipping slow work you have already done.",
  machine: "A shuttle carries each request card past a cache bin; a matching card in the bin means the slow origin press is skipped.",
  stations: [
    { id: "intake", concept: "REQUEST", does: "Takes the next request card.", fails: "Nothing enters the machine." },
    { id: "cache", concept: "CACHE", does: "Probes the bin for a matching card.", fails: "Every request goes to the origin." },
    { id: "origin", concept: "ORIGIN", does: "Presses a fresh answer, slowly.", fails: "Misses cannot be served." },
    { id: "exit", concept: "RESPONSE", does: "Hands the answer back.", fails: "The caller waits forever." },
  ],
  quiz: [
    { stage: "pre", question: "Three requests ask for user:7, user:9, user:7. With a cache, how many go to the slow origin?", options: ["One", "Two", "Three", "None"], correct: 1, explanation: "user:7 and user:9 miss and travel to the origin; the repeat of user:7 is a hit." },
    { stage: "check", question: "What does the probe check in the cache bin?", options: ["Whether the request key is stored", "How old the origin server is", "Whether the request is valid", "How long the last request took"], correct: 0, explanation: "A lookup compares the request key to the keys already stored." },
    { stage: "check", question: "With the cache switched off, what happens to the simulated time?", options: ["It stays the same", "It drops to zero", "It grows, because every request pays the origin cost", "It halves"], correct: 2, explanation: "Every request pays the 120 ms origin cost when nothing is stored." },
    { stage: "check", question: "When is a card stored in the bin?", options: ["Before every lookup", "After an origin fetch", "Only on a hit", "Never"], correct: 1, explanation: "A read-through cache stores the answer it just fetched so the next request can hit." },
    { stage: "post", question: "Which request pattern gains most from a cache?", options: ["Every key unique", "Random keys never repeated", "Keys sorted by size", "The same key asked again and again"], correct: 3, explanation: "Repeats are what a cache turns into hits." },
    { stage: "post", question: "What does a cache spend to save time?", options: ["Memory to keep stored answers", "Network bandwidth", "CPU cycles on every hit", "Disk writes for each miss"], correct: 0, explanation: "The bin is memory: it holds answers so the origin is skipped." },
  ],
  sources: [{ label: "RFC 9111: HTTP Caching", url: "https://www.rfc-editor.org/rfc/rfc9111" }],
  notes: "This is a simulation. Times are fixed costs set by the model, not measurements.",
};
