// What a typed or spoken message is asking for (architecture 2.2 `intent`). Pure rules, no model.
// kind: 'capture' (file it as a thought), 'ask' (answer from saved thoughts), 'expand' (develop the last idea),
// 'plan' (break the last task into steps), 'done' (close the conversation).

const DONE = /^(?:(?:ok(?:ay)?|yes|yeah|no|great|cool|alright)[\s,]*)?(?:done|that'?s (?:all|it)|that is (?:all|it)|all done|i'?m done|nothing else|no thanks?|thanks?(?: you| a lot)?|thank you(?: very much)?|bye|goodbye|close|finished)[\s.!]*$/i;

const EXPAND = /^(?:(?:please|can you|could you|now|ok(?:ay)?|hey)[\s,]+)*(?:expand|flesh (?:it |that |this )?out|develop|elaborate|brainstorm|build on|think through|help me (?:develop|expand|flesh out|think through))(?:\s+(?:on\s+)?(?:that|this|it|the|my|last)(?:\s+(?:idea|one|thought))?)?[\s.!]*$/i;

const PLAN = /^(?:(?:please|can you|could you|now|ok(?:ay)?|hey)[\s,]+)*(?:plan|make a plan(?: for)?|break (?:that|this|it) (?:down|into steps)|break down|steps for|give me steps for|help me plan)(?:\s+(?:that|this|it|the|my|last)(?:\s+(?:task|one|thing))?)?[\s.!]*$/i;

const ASK_STRONG = [
  /\bwhat (?:did|have|was|were) i (?:say|said|write|wrote|note|noted|mention|mentioned|save|saved|think|thought)\b/i,
  /\bwhat do i (?:have|know|say)\b/i,
  /\bwhat(?:'s| is| are) (?:on )?my\b/i,
  /\b(?:did|have) i (?:say|said|write|wrote|note|noted|mention|mentioned|save|saved)\b/i,
  /\bdo i have (?:any|a|an|something|anything)\b/i,
  /^(?:show|find|search|look up|list|tell) (?:me )?(?:my |the |all |any |everything |anything )/i,
  /^search (?:for )?\S/i,
  /^find (?:for )?(?:my|the|all|any|anything|everything|notes?|thoughts?|ideas?|tasks?|reminders?|about|what|where|when)\b/i,
  /\b(?:anything|something|any (?:ideas?|thoughts?|notes?|tasks?|reminders?)) (?:about|on|regarding)\b/i,
  /\bwhat (?:ideas|tasks|reminders|notes|thoughts) (?:do i|have i)\b/i,
];
const RECALL_WORDS = /\b(?:said|say|wrote|write|noted|note|notes|mention|mentioned|saved|save|thoughts?|ideas?|tasks?|reminders?|journal|remember|told|tell)\b/i;
const WH_START = /^(?:what|when|where|which|who|how many|how much|did|do|have|is there|are there|was there)\b/i;

const strip = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

export function intent(text) {
  const t = strip(text);
  if (!t) return { kind: 'capture', text: t };
  const lower = t.toLowerCase();
  if (DONE.test(lower)) return { kind: 'done', text: t };
  if (EXPAND.test(lower)) return { kind: 'expand', text: t };
  if (PLAN.test(lower)) return { kind: 'plan', text: t };
  if (/^what if\b/i.test(lower) || /^remind me\b/i.test(lower)) return { kind: 'capture', text: t };
  const asked = t.replace(/^(?:hey|ok(?:ay)?|so|um+|please|can you|could you|tell me)[\s,]+/i, '');
  if (ASK_STRONG.some((re) => re.test(asked))) return { kind: 'ask', text: asked };
  if (/\?\s*$/.test(t) && WH_START.test(asked) && RECALL_WORDS.test(asked)) return { kind: 'ask', text: asked };
  return { kind: 'capture', text: t };
}
