// AC-X3.1 / AC-X3.3 fixtures. Each ramble lists the items a person would expect, in spoken order: { text, type }.
// `text` is the model's exact-words field (what a mocked model replays); the rule splitter is scored on count only.
export const NOW = new Date(2026, 8, 29, 10, 0, 0); // Tuesday 2026-09-29 10:00 local

export const RAMBLES = [
  {
    note: "Okay so tomorrow I need to call the dentist to move my appointment, and also buy dog food on the way home. Oh and I had this idea, what if the gym app showed a streak calendar. Remind me on Friday at 6pm to send the invoice to Maria.",
    items: [
      { text: 'tomorrow I need to call the dentist to move my appointment', type: 'task', title: 'Call the dentist to move my appointment', when: 'tomorrow' },
      { text: 'buy dog food on the way home', type: 'task', title: 'Buy dog food', when: null },
      { text: 'what if the gym app showed a streak calendar', type: 'idea', title: 'Gym app streak calendar', when: null },
      { text: 'Remind me on Friday at 6pm to send the invoice to Maria', type: 'reminder', title: 'Send the invoice to Maria', when: 'Friday at 6pm' },
    ],
  },
  {
    note: "Had a rough day at work, the meeting went badly and I felt nobody listened. I'm grateful my sister called though.",
    items: [{ text: "Had a rough day at work, the meeting went badly and I felt nobody listened. I'm grateful my sister called though.", type: 'journal', title: 'Rough day at work', when: null }],
  },
  {
    note: 'Idea for the weekend: a small herb garden on the balcony, basil and mint, maybe with a drip system so it survives August.',
    items: [{ text: 'a small herb garden on the balcony, basil and mint, maybe with a drip system so it survives August', type: 'idea', title: 'Balcony herb garden', when: null }],
  },
  {
    note: 'Pay the electricity bill before the 5th and renew the car insurance next week.',
    items: [
      { text: 'Pay the electricity bill before the 5th', type: 'task', title: 'Pay the electricity bill', when: null },
      { text: 'renew the car insurance next week', type: 'task', title: 'Renew the car insurance', when: 'next week' },
    ],
  },
  {
    note: "Don't forget mum's birthday on October 12th. And I should really think about going back to the gym, I keep skipping it and I feel worse.",
    items: [
      { text: "Don't forget mum's birthday on October 12th", type: 'reminder', title: "Mum's birthday", when: null },
      { text: 'I should really think about going back to the gym, I keep skipping it and I feel worse', type: 'journal', title: 'Going back to the gym', when: null },
    ],
  },
  {
    note: 'Email the landlord about the boiler. Also pick up the parcel from the post office tomorrow at 5pm. What if we made a shared shopping list for the flat?',
    items: [
      { text: 'Email the landlord about the boiler', type: 'task', title: 'Email the landlord about the boiler', when: null },
      { text: 'pick up the parcel from the post office tomorrow at 5pm', type: 'reminder', title: 'Pick up the parcel', when: 'tomorrow at 5pm' },
      { text: 'What if we made a shared shopping list for the flat', type: 'idea', title: 'Shared shopping list for the flat', when: null },
    ],
  },
  {
    note: 'I keep thinking about starting a podcast about old Athens bars. Book the dentist for Thursday. Renew my passport, it expires in March.',
    items: [
      { text: 'I keep thinking about starting a podcast about old Athens bars', type: 'idea', title: 'Podcast about old Athens bars', when: null },
      { text: 'Book the dentist for Thursday', type: 'task', title: 'Book the dentist', when: 'Thursday' },
      { text: 'Renew my passport, it expires in March', type: 'task', title: 'Renew my passport', when: null },
    ],
  },
  {
    note: 'Call Nick tomorrow morning and then send the slides to Anna. Remind me at 8pm to water the plants.',
    items: [
      { text: 'Call Nick tomorrow morning', type: 'task', title: 'Call Nick', when: 'tomorrow morning' },
      { text: 'send the slides to Anna', type: 'task', title: 'Send the slides to Anna', when: null },
      { text: 'Remind me at 8pm to water the plants', type: 'reminder', title: 'Water the plants', when: '8pm' },
    ],
  },
  {
    note: "Feeling tired today but the walk helped. Text Maria about Saturday. Oh and buy a birthday card for dad.",
    items: [
      { text: 'Feeling tired today but the walk helped', type: 'journal', title: 'Tired but the walk helped', when: null },
      { text: 'Text Maria about Saturday', type: 'task', title: 'Text Maria about Saturday', when: null },
      { text: 'buy a birthday card for dad', type: 'task', title: 'Buy a birthday card for dad', when: null },
    ],
  },
  {
    note: 'We could add a dark mode to the tracker app. It might also need a widget. Fix the login bug on Monday and write the release notes.',
    items: [
      { text: 'We could add a dark mode to the tracker app. It might also need a widget', type: 'idea', title: 'Dark mode and widget for the tracker', when: null },
      { text: 'Fix the login bug on Monday', type: 'task', title: 'Fix the login bug', when: 'Monday' },
      { text: 'write the release notes', type: 'task', title: 'Write the release notes', when: null },
    ],
  },
];

// AC-X3.3: single sentences that must stay one record.
export const SINGLES = [
  'Buy milk and eggs on the way home',
  'Go to the shop and pick up some milk',
  'I think the garden needs more work than I expected',
  'Remind me to call mum at 6pm',
  'What if the app let people share lists with friends and family',
  'The meeting went well and I felt proud of the team',
  'Call the dentist tomorrow to move my appointment',
  'Idea: a small podcast about old Athens bars, maybe with guests',
  'I need to tidy up, then relax for the evening',
  'Book a table for Friday at 8pm and invite Sam',
  'Send the invoice to Maria, she asked for it twice',
  'Fix the leaking tap in the bathroom before the weekend',
];
