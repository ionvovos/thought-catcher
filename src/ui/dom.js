// Small DOM helper. User text reaches the DOM only through textContent / text nodes.

const FORBIDDEN = new Set(['style', 'innerHTML', 'outerHTML', 'html']);
const PROPS = new Set(['hidden', 'disabled', 'checked', 'value']);

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (FORBIDDEN.has(key)) throw new Error(`el(): "${key}" is not allowed`);
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (PROPS.has(key)) node[key] = value;
    else if (value !== null && value !== undefined && value !== false) node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

function append(node, children) {
  if (Array.isArray(children)) {
    for (const c of children) append(node, c);
  } else if (children instanceof Node) {
    node.appendChild(children);
  } else if (typeof children === 'string' || typeof children === 'number') {
    node.appendChild(document.createTextNode(String(children)));
  }
}

export function clear(node) {
  node.replaceChildren();
}
