const SIDEKICK_ELEM_ATTR = 'data-sidekick-element-id';
const SNAPSHOT_MAX_ELEMENTS = 250;
const SNAPSHOT_TEXT_LIMIT = 12000;
const CLICK_POST_WAIT_MS = 350;
const sidekickSessionPrefix = `sk-${Math.random().toString(36).slice(2, 10)}`;
let sidekickElementCounter = 0;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function ensureElementId(element) {
  const existing = element.getAttribute(SIDEKICK_ELEM_ATTR);
  if (existing) {
    return existing;
  }

  const nextId = `${sidekickSessionPrefix}-${++sidekickElementCounter}`;
  element.setAttribute(SIDEKICK_ELEM_ATTR, nextId);
  return nextId;
}

function getInteractableElements() {
  return Array.from(
    document.querySelectorAll(
      'input, textarea, select, button, a[href], [role="button"], [contenteditable="true"], [contenteditable=""]'
    )
  );
}

function isVisible(element) {
  const style = window.getComputedStyle(element);
  if (!style || style.display === 'none' || style.visibility === 'hidden') {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getElementLabel(element) {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) {
    return ariaLabel.trim();
  }

  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label && label.textContent && label.textContent.trim()) {
      return label.textContent.trim();
    }
  }

  const wrappedLabel = element.closest('label');
  if (wrappedLabel && wrappedLabel.textContent && wrappedLabel.textContent.trim()) {
    return wrappedLabel.textContent.trim();
  }

  const placeholder = element.getAttribute('placeholder');
  if (placeholder && placeholder.trim()) {
    return placeholder.trim();
  }

  const text = (element.textContent || '').trim();
  if (text) {
    return text.slice(0, 140);
  }

  return '';
}

function buildElementSnapshot(element) {
  const elementId = ensureElementId(element);
  const rect = element.getBoundingClientRect();

  return {
    elementId,
    tag: element.tagName.toLowerCase(),
    type: (element.getAttribute('type') || '').toLowerCase(),
    role: (element.getAttribute('role') || '').toLowerCase(),
    label: getElementLabel(element),
    name: element.getAttribute('name') || '',
    placeholder: element.getAttribute('placeholder') || '',
    href: element.getAttribute('href') || '',
    value:
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement
        ? element.value || ''
        : '',
    checked: element instanceof HTMLInputElement ? !!element.checked : false,
    disabled: !!element.disabled,
    visible: isVisible(element),
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function getPageSnapshot() {
  const interactables = getInteractableElements()
    .slice(0, SNAPSHOT_MAX_ELEMENTS)
    .map((element) => buildElementSnapshot(element));

  const pageText = (document.body?.innerText || '').slice(0, SNAPSHOT_TEXT_LIMIT);

  return {
    url: window.location.href,
    title: document.title || '',
    pageText,
    interactables,
    generatedAt: Date.now(),
  };
}

function findElementBySidekickId(elementId) {
  if (!elementId || typeof elementId !== 'string') {
    return null;
  }

  // Ensure IDs are assigned in case the action arrives before any snapshot call.
  getInteractableElements().forEach((element) => {
    ensureElementId(element);
  });

  return document.querySelector(`[${SIDEKICK_ELEM_ATTR}="${elementId}"]`);
}

function fillInput(elementId, value, clearFirst = true) {
  const element = findElementBySidekickId(elementId);

  if (!element) {
    return { ok: false, error: `Element not found for elementId=${elementId}` };
  }

  if (
    !(
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement ||
      element.isContentEditable
    )
  ) {
    return { ok: false, error: 'Target is not an input-like element' };
  }

  if (element.disabled) {
    return { ok: false, error: 'Target element is disabled' };
  }

  element.focus({ preventScroll: false });

  const nextValue = typeof value === 'string' ? value : String(value ?? '');

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.value = clearFirst ? nextValue : `${element.value || ''}${nextValue}`;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (element instanceof HTMLSelectElement) {
    element.value = nextValue;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (element.isContentEditable) {
    const currentText = element.textContent || '';
    element.textContent = clearFirst ? nextValue : `${currentText}${nextValue}`;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, data: nextValue }));
  }

  return {
    ok: true,
    elementId,
    value: nextValue,
  };
}

async function clickElement(elementId, waitMs = CLICK_POST_WAIT_MS) {
  const element = findElementBySidekickId(elementId);

  if (!element) {
    return { ok: false, error: `Element not found for elementId=${elementId}` };
  }

  if (element.disabled) {
    return { ok: false, error: 'Target element is disabled' };
  }

  element.scrollIntoView({ block: 'center', inline: 'nearest' });
  element.click();
  await wait(waitMs);

  return {
    ok: true,
    elementId,
    tag: element.tagName.toLowerCase(),
    waitedMs: waitMs,
  };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageContent') {
    const pageContent = document.body?.innerText || '';
    sendResponse({ content: pageContent });
    return;
  }

  if (request.action === 'ping') {
    sendResponse({ status: 'ready' });
    return;
  }

  if (request.action === 'getPageSnapshot') {
    sendResponse({ snapshot: getPageSnapshot() });
    return;
  }

  if (request.action === 'fillInput') {
    const { elementId, value, clearFirst = true } = request;
    sendResponse(fillInput(elementId, value, clearFirst));
    return;
  }

  if (request.action === 'clickElement') {
    const { elementId, waitMs = CLICK_POST_WAIT_MS } = request;
    clickElement(elementId, waitMs)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error?.message || 'Click failed' }));
    return true;
  }
});
