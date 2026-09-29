// Per-type presentation: label, icon name and the `.t-<type>` class that sets --tc / --tb / --td (design.md 1.1).
// Type is never carried by colour alone: every place that shows a type also shows the icon and, where there is room, the word.
export const TYPE_ORDER = Object.freeze(['reminder', 'task', 'idea', 'journal']);

export const TYPE_META = Object.freeze({
  idea: Object.freeze({ type: 'idea', label: 'Idea', plural: 'Ideas', icon: 'idea', cls: 't-idea' }),
  task: Object.freeze({ type: 'task', label: 'Task', plural: 'Tasks', icon: 'task', cls: 't-task' }),
  journal: Object.freeze({ type: 'journal', label: 'Journal', plural: 'Journal notes', icon: 'journal', cls: 't-journal' }),
  reminder: Object.freeze({ type: 'reminder', label: 'Reminder', plural: 'Reminders', icon: 'reminder', cls: 't-reminder' }),
});

export const typeMeta = (type) => TYPE_META[type] ?? TYPE_META.idea;
