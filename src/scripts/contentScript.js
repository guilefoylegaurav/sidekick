const KOAN_REGISTRY_KEY = '__koanElementRegistry';
const DEFAULT_SNAPSHOT_OPTIONS = {
  maxTextLength: 12000,
  maxElements: 80,
  includeOffscreen: false,
  includeValues: false,
};

function getOrCreateRegistry() {
  if (!window[KOAN_REGISTRY_KEY]) {
    window[KOAN_REGISTRY_KEY] = {
      nextId: 1,
      elementsById: new Map(),
      lastSnapshotAt: 0,
    };
  }
  return window[KOAN_REGISTRY_KEY];
}

function resetRegistry() {
  const registry = getOrCreateRegistry();
  registry.nextId = 1;
  registry.elementsById = new Map();
  registry.lastSnapshotAt = Date.now();
  return registry;
}

function getElementById(elementId) {
  if (!elementId || typeof elementId !== 'string') return null;
  const registry = getOrCreateRegistry();
  return registry.elementsById.get(elementId) || null;
}

function isElementVisible(element, includeOffscreen) {
  if (!element || element.nodeType !== 1) return false;
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  if (includeOffscreen) return true;
  const inViewport = rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth;
  return inViewport;
}

function truncateText(text, maxLength) {
  if (!text || typeof text !== 'string') return '';
  if (!maxLength || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

function getLabelFromAria(element) {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel.trim();
  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const ids = ariaLabelledBy.split(/\s+/).filter(Boolean);
    const labelText = ids
      .map((id) => {
        const labelEl = document.getElementById(id);
        return labelEl ? labelEl.textContent.trim() : '';
      })
      .filter(Boolean)
      .join(' ');
    if (labelText) return labelText;
  }
  return '';
}

function getLabelForInput(element) {
  if (!element || !element.id) return '';
  const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
  if (label && label.textContent) {
    return label.textContent.trim();
  }
  return '';
}

function getElementLabel(element) {
  const ariaLabel = getLabelFromAria(element);
  if (ariaLabel) return ariaLabel;

  const labelForInput = getLabelForInput(element);
  if (labelForInput) return labelForInput;

  if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) return placeholder.trim();
    const name = element.getAttribute('name');
    if (name) return name.trim();
  }

  const text = element.textContent || '';
  return text.trim();
}

function buildSelector(element) {
  if (!element || element.nodeType !== 1) return '';
  if (element.id) return `#${CSS.escape(element.id)}`;

  const parts = [];
  let current = element;
  while (current && current.nodeType === 1 && current !== document.body) {
    let part = current.tagName.toLowerCase();
    if (current.classList && current.classList.length > 0) {
      part += `.${CSS.escape(current.classList[0])}`;
    }

    const parent = current.parentElement;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(current) + 1;
        part += `:nth-of-type(${index})`;
      }
    }

    parts.unshift(part);
    if (parent && parent.id) {
      parts.unshift(`#${CSS.escape(parent.id)}`);
      break;
    }
    current = parent;
  }

  return parts.join(' > ');
}

function collectInteractiveElements(options) {
  const selectors = [
    'a[href]',
    'button',
    'input',
    'textarea',
    'select',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
  ];

  const registry = resetRegistry();
  const nodes = Array.from(document.querySelectorAll(selectors.join(',')));

  const elements = [];
  for (const element of nodes) {
    if (elements.length >= options.maxElements) break;
    if (!isElementVisible(element, options.includeOffscreen)) continue;

    if (element.tagName === 'INPUT') {
      const type = (element.getAttribute('type') || '').toLowerCase();
      if (type === 'hidden') continue;
    }

    const elementId = `el-${registry.nextId++}`;
    registry.elementsById.set(elementId, element);

    const rect = element.getBoundingClientRect();
    const label = getElementLabel(element);
    const tag = element.tagName.toLowerCase();
    const type = element.getAttribute('type') || '';
    const role = element.getAttribute('role') || '';
    const placeholder = element.getAttribute('placeholder') || '';
    const name = element.getAttribute('name') || '';
    const href = tag === 'a' ? element.getAttribute('href') || '' : '';
    const selector = buildSelector(element);

    const entry = {
      elementId,
      tag,
      type,
      role,
      label,
      text: (element.textContent || '').trim(),
      placeholder,
      name,
      id: element.id || '',
      href,
      selector,
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };

    if (options.includeValues) {
      const isPassword = tag === 'input' && type.toLowerCase() === 'password';
      if (!isPassword && (tag === 'input' || tag === 'textarea' || tag === 'select')) {
        entry.value = element.value || '';
      }
      if (element.isContentEditable) {
        entry.value = element.textContent || '';
      }
    }

    elements.push(entry);
  }

  return elements;
}

function resolveTargetElement(target) {
  if (!target) return { element: null, error: 'Missing target' };

  if (typeof target === 'string') {
    const element = document.querySelector(target);
    return element ? { element } : { element: null, error: 'Target not found' };
  }

  const elementId = target.elementId || '';
  if (elementId) {
    const element = getElementById(elementId);
    if (element) return { element, elementId };
  }

  const selector = target.selector || '';
  if (selector) {
    const element = document.querySelector(selector);
    return element ? { element, selector } : { element: null, error: 'Target not found' };
  }

  return { element: null, error: 'Unsupported target' };
}

function performClick(target, options = {}) {
  const { element, elementId, selector, error } = resolveTargetElement(target);
  if (!element) {
    return { ok: false, error: error || 'Target not found' };
  }

  const scrollIntoView = options.scrollIntoView !== false;
  if (scrollIntoView) {
    element.scrollIntoView({ block: 'center', inline: 'center' });
  }

  const rect = element.getBoundingClientRect();
  const isVisible = rect.width > 0 && rect.height > 0;
  if (!isVisible) {
    return { ok: false, error: 'Target not visible', elementId, selector };
  }

  element.focus({ preventScroll: true });
  element.click();

  return {
    ok: true,
    elementId,
    selector,
    tag: element.tagName.toLowerCase(),
    timestamp: Date.now(),
  };
}

function setNativeValue(element, value) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
  const prototype = Object.getPrototypeOf(element);
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
    return;
  }
  if (valueSetter) {
    valueSetter.call(element, value);
    return;
  }
  element.value = value;
}

function getTypeOptions(options = {}) {
  return {
    scrollIntoView: options.scrollIntoView !== false,
    shouldAppend: options.append === true || options.clear === false,
  };
}

function focusForTyping(element, scrollIntoView) {
  if (scrollIntoView) {
    element.scrollIntoView({ block: 'center', inline: 'center' });
  }
  element.focus({ preventScroll: true });
}

function dispatchInputEvents(element) {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function isUnsupportedInputType(type) {
  const unsupported = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image', 'range', 'color'];
  return unsupported.includes(type);
}

function buildTypeResult(element, elementId, selector, valueLength, appended, type = '') {
  const result = {
    ok: true,
    elementId,
    selector,
    tag: element.tagName.toLowerCase(),
    valueLength,
    appended,
    timestamp: Date.now(),
  };

  if (type) {
    result.type = type;
  }

  return result;
}

function typeIntoTextInput(element, value, meta, options) {
  const type = (element.getAttribute('type') || '').toLowerCase();
  if (isUnsupportedInputType(type)) {
    return { ok: false, error: 'Unsupported input type', elementId: meta.elementId, selector: meta.selector };
  }

  focusForTyping(element, options.scrollIntoView);
  const currentValue = element.value || '';
  const nextValue = options.shouldAppend ? currentValue + value : value;
  setNativeValue(element, nextValue);
  dispatchInputEvents(element);

  return buildTypeResult(element, meta.elementId, meta.selector, nextValue.length, options.shouldAppend, type);
}

function typeIntoSelect(element, value, meta, options) {
  focusForTyping(element, options.scrollIntoView);
  setNativeValue(element, value);
  dispatchInputEvents(element);

  return buildTypeResult(element, meta.elementId, meta.selector, value.length, false);
}

function typeIntoContentEditable(element, value, meta, options) {
  focusForTyping(element, options.scrollIntoView);
  const currentValue = element.textContent || '';
  const nextValue = options.shouldAppend ? currentValue + value : value;
  element.textContent = nextValue;
  dispatchInputEvents(element);

  return buildTypeResult(element, meta.elementId, meta.selector, nextValue.length, options.shouldAppend);
}

function performType(target, text, options = {}) {
  const { element, elementId, selector, error } = resolveTargetElement(target);
  if (!element) {
    return { ok: false, error: error || 'Target not found' };
  }

  if (text === undefined || text === null) {
    return { ok: false, error: 'Missing text' };
  }

  if (element.disabled) {
    return { ok: false, error: 'Target disabled', elementId, selector };
  }

  const value = String(text);
  const tag = element.tagName.toLowerCase();
  const resolvedOptions = getTypeOptions(options);
  const meta = { elementId, selector };

  if (tag === 'input' || tag === 'textarea') {
    return typeIntoTextInput(element, value, meta, resolvedOptions);
  }

  if (tag === 'select') {
    return typeIntoSelect(element, value, meta, resolvedOptions);
  }

  if (element.isContentEditable) {
    return typeIntoContentEditable(element, value, meta, resolvedOptions);
  }

  return { ok: false, error: 'Target not text-input capable', elementId, selector };
}

function buildPageSnapshot(requestOptions = {}) {
  const options = { ...DEFAULT_SNAPSHOT_OPTIONS, ...requestOptions };
  const visibleText = document.body ? document.body.innerText || '' : '';

  return {
    url: window.location.href,
    title: document.title || '',
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    },
    visibleText: truncateText(visibleText, options.maxTextLength),
    interactiveElements: collectInteractiveElements(options),
    truncated: visibleText.length > options.maxTextLength,
    generatedAt: Date.now(),
  };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageContent') {
    const pageContent = document.body ? document.body.innerText || '' : '';
    sendResponse({ content: pageContent });
  } else if (request.action === 'getPageSnapshot') {
    const snapshot = buildPageSnapshot(request.options || {});
    sendResponse({ snapshot });
  } else if (request.action === 'performClick') {
    const result = performClick(request.target, request.options || {});
    sendResponse({ result });
  } else if (request.action === 'performType') {
    const result = performType(request.target, request.text, request.options || {});
    sendResponse({ result });
  } else if (request.action === 'ping') {
    // Respond to ping to indicate content script is present
    sendResponse({ status: 'ready' });
  }
});
