// S3 contract: renderAnswer(answer, ctx) -> HTMLElement, the answer card used inside the thread. Stub until the screen lands.
export function renderAnswer(answer, ctx) {
  const p = document.createElement('p');
  p.textContent = answer?.answer ?? '';
  return p;
}
