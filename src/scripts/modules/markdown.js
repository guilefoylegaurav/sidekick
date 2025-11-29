// Markdown formatting and code block utilities

/**
 * Escapes HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML string
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Handles copy button click for code blocks
 * @param {Event} event - Click event
 */
function copyCode(event) {
  const btn = event.target;
  const codeId = btn.getAttribute('data-code-id');
  const codeElement = document.getElementById(codeId);
  
  if (codeElement) {
    navigator.clipboard.writeText(codeElement.textContent).then(() => {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('copied');
      }, 2000);
    });
  }
}

/**
 * Attaches copy button event listeners to all copy buttons in the given element
 * @param {HTMLElement} element - Element containing copy buttons
 */
function attachCopyListeners(element) {
  element.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', copyCode);
  });
}

/**
 * Formats code blocks with custom wrapper and copy button
 * @param {string} language - Programming language
 * @param {string} code - Code content
 * @returns {string} HTML string for code block
 */
function formatCodeBlock(language, code) {
  const lang = language || 'text';
  const codeId = 'code-' + Math.random().toString(36).substr(2, 9);
  const escapedCode = escapeHtml(code.trim());
  return `
    <div class="code-block">
      <div class="code-header">
        <span>${lang}</span>
        <button class="copy-btn" data-code-id="${codeId}">Copy</button>
      </div>
      <div class="code-content" id="${codeId}">${escapedCode}</div>
    </div>
  `;
}

/**
 * Basic markdown formatting fallback (when marked.js is not available)
 * @param {string} message - Message to format
 * @returns {string} Formatted HTML string
 */
function basicMarkdownFormat(message) {
  // Basic markdown formatting fallback
  let html = escapeHtml(message);
  
  // Convert double line breaks to paragraphs
  html = html.split('\n\n').map(paragraph => {
    if (paragraph.trim()) {
      return `<p>${paragraph.trim().replace(/\n/g, '<br>')}</p>`;
    }
    return '';
  }).join('');
  
  // Handle code blocks
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
    return formatCodeBlock(language, code);
  });
  
  // Handle inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background: #161b22; padding: 2px 4px; border-radius: 3px; font-family: \'JetBrains Mono\', monospace;">$1</code>');
  
  // Handle bold text
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Handle italic text
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  return html;
}

/**
 * Formats message with markdown support using marked.js or fallback
 * If a container element is provided, sets its innerHTML and attaches copy button listeners
 * @param {string} message - Message to format
 * @param {HTMLElement|null} containerElement - Optional element to set HTML and attach listeners to
 * @returns {string} Formatted HTML string
 */
export function formatMessageWithCode(message, containerElement = null) {
  let html;
  
  // Check if marked is available
  if (typeof marked === 'undefined') {
    console.warn('marked.js not loaded, using basic formatting');
    html = basicMarkdownFormat(message);
  } else {
    // Parse markdown using marked.js
    html = marked.parse(message);
    
    // Post-process code blocks to add our custom wrapper with copy button
    html = html.replace(/<pre><code(?:\s+class="language-(\w+)")?>([\s\S]*?)<\/code><\/pre>/g, (match, language, code) => {
      return formatCodeBlock(language, code);
    });
  }
  
  // If container element is provided, set innerHTML and attach listeners
  if (containerElement) {
    containerElement.innerHTML = html;
    attachCopyListeners(containerElement);
  }
  
  return html;
}

