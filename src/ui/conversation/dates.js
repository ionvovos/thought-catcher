// Quick date choices for the date chip on a filed card. Pure: `now` is a parameter. Local time, ISO out.
const at = (base, days, hour, minute = 0) => {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, hour, minute, 0, 0);
  return d.toISOString();
};

export function dateOptions(now) {
  const list = [];
  if (now.getHours() < 18) list.push({ value: at(now, 0, 18), label: 'Today, evening' });
  list.push({ value: at(now, 1, 9), label: 'Tomorrow morning' });
  const toSat = (6 - now.getDay() + 7) % 7 || 7;
  list.push({ value: at(now, toSat, 9), label: 'This weekend' });
  const toMon = (1 - now.getDay() + 7) % 7 || 7;
  list.push({ value: at(now, toMon, 9), label: 'Next week' });
  list.push({ value: null, label: 'No date' });
  return list;
}
