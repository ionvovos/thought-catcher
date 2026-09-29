// AC-X5.1 / X6.1 / X6.2 fixtures: 30 thoughts, 10 questions with the thoughts that answer them, related pairs, topics.
// Built from plain records; tests turn them into stored thoughts. The `meaning` questions share few words with their
// answers (they need the embedding model, e2e/v2-brain.mjs); the `lexical` ones share words (they run with a stub embedder).
export const THOUGHTS = [
  ['g1', 'journal', 'go back to the gym, I keep skipping it and I feel worse'],
  ['g2', 'idea', 'gym app streak calendar'],
  ['g3', 'task', 'book a personal trainer session for Thursday'],
  ['c1', 'task', 'call the dentist to move my appointment'],
  ['c2', 'journal', 'the dentist said I need a new filling'],
  ['f1', 'task', 'pay the electricity bill before the 5th'],
  ['f2', 'task', 'renew the car insurance next week'],
  ['f3', 'idea', 'budget spreadsheet for monthly spending'],
  ['h1', 'idea', 'small herb garden on the balcony, basil and mint'],
  ['h2', 'task', 'buy a drip irrigation kit for the balcony plants'],
  ['h3', 'reminder', 'water the plants every second day'],
  ['p1', 'idea', 'podcast about old Athens bars'],
  ['p2', 'idea', 'interview the owner of the oldest bar in Plaka for the podcast'],
  ['p3', 'task', 'record a trailer for the Athens podcast'],
  ['m1', 'reminder', "mum's birthday on October 12th"],
  ['m2', 'task', 'buy a birthday card for dad'],
  ['m3', 'task', 'call my sister about the family dinner'],
  ['w1', 'journal', 'rough day at work, the meeting went badly'],
  ['w2', 'task', 'write the release notes for the tracker app'],
  ['w3', 'task', 'fix the login bug in the tracker app'],
  ['w4', 'idea', 'the tracker app needs a dark mode'],
  ['t1', 'idea', 'learn to cook a proper Greek moussaka'],
  ['t2', 'task', 'buy aubergines and minced meat for Sunday'],
  ['t3', 'task', 'book flights to Berlin for March'],
  ['t4', 'idea', 'Berlin trip: visit the museum island and the wall'],
  ['s1', 'journal', 'slept badly all week, need to stop coffee after 3pm'],
  ['s2', 'idea', 'walk 10000 steps every day'],
  ['r1', 'idea', 'read the book about deep work'],
  ['r2', 'task', 'finish the online course on agentic engineering'],
  ['r3', 'journal', 'grateful my sister called today'],
].map(([id, type, text]) => ({ id, type, text }));

// question -> ids that answer it (the answer needs at least one of them in the top 3)
export const QUESTIONS_MEANING = [
  ['what did I say about exercise?', ['g1', 'g2', 'g3', 's2']],
  ['what do I need to do about my teeth?', ['c1', 'c2']],
  ['what bills do I have to pay?', ['f1', 'f2']],
  ['what did I plan for the balcony?', ['h1', 'h2', 'h3']],
  ['anything about the Athens podcast?', ['p1', 'p2', 'p3']],
  ["when is mum's birthday?", ['m1']],
  ["what's going on with the tracker app?", ['w2', 'w3', 'w4']],
  ['what did I want to cook?', ['t1', 't2']],
  ['trip plans for Berlin', ['t3', 't4']],
  ['how has my sleep been?', ['s1']],
];

export const QUESTIONS_LEXICAL = [
  ['what did I say about the gym?', ['g1', 'g2', 'g3']],
  ['what about the dentist?', ['c1', 'c2']],
  ['what about the electricity bill?', ['f1']],
  ['what about the balcony?', ['h1', 'h2']],
  ['anything about the Athens podcast?', ['p1', 'p2', 'p3']],
  ["when is mum's birthday?", ['m1']],
  ['what about the tracker app?', ['w2', 'w3', 'w4']],
  ['what about Berlin?', ['t3', 't4']],
];

// pairs that are about the same thing: the partner must be in the top 3 related of the other
export const RELATED_PAIRS = [['g1', 'g2'], ['h1', 'h2'], ['p1', 'p2'], ['w3', 'w4'], ['t3', 't4'], ['t1', 't2']];

// AC-X6.2: three topics of 3-4 ideas plus six unrelated ideas
export const TOPIC_IDEAS = [
  ['a1', 'gym app streak calendar for workouts'], ['a2', 'workout tracker that rewards gym streaks'], ['a3', 'gym buddy matching by workout schedule'],
  ['b1', 'podcast about old Athens bars'], ['b2', 'interview bar owners in Athens for the podcast'], ['b3', 'podcast trailer with Athens street sounds'], ['b4', 'guest list for the Athens bars podcast'],
  ['c1', 'tracker app dark mode'], ['c2', 'tracker app home screen widget'], ['c3', 'tracker app export to spreadsheet'],
  ['u1', 'a board game about medieval bakers'], ['u2', 'learn to play the oud'], ['u3', 'sourdough starter for winter'], ['u4', 'paint the hallway green'],
  ['u5', 'a short film about a lighthouse keeper'], ['u6', 'plant tomatoes on the roof'],
].map(([id, text]) => ({ id, type: 'idea', text }));
export const TOPIC_EXPECTED = [['a1', 'a2', 'a3'], ['b1', 'b2', 'b3', 'b4'], ['c1', 'c2', 'c3']];
