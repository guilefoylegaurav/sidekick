const messagesDiv = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');

let pageContent = "";
let currentTabId = null;

// Get current tab ID and load tab-specific data
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    currentTabId = tabs[0].id;
    loadTabData();
  }
});

function loadTabData() {
  chrome.storage.local.get([`messages_${currentTabId}`], (result) => {
    const savedMessages = result[`messages_${currentTabId}`] || [];
    savedMessages.forEach(msg => displayMessage(msg.content, msg.sender, false));
  });
}

// Request page content when the side panel loads
window.addEventListener('load', () => {
  chrome.runtime.sendMessage({ action: "requestPageContent" }, (response) => {
    if (response && response.content) {
      pageContent = response.content;
      console.log("Page content loaded:", pageContent.substring(0, 100) + "..."); // Log first 100 chars
    } else {
      console.log("Could not retrieve page content.");
    }
  });
});

sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    sendMessage();
  }
});

function sendMessage() {
  const message = userInput.value.trim();
  if (message) {
    displayMessage(message, 'user');
    userInput.value = '';
    getLLMResponse(message);
  }
}

async function getLLMResponse(userMessage) {
  // Show loading animation
  showLoading();
  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay
  
  // In a real scenario, you would send pageContent and userMessage to your LLM API
  const llmResponse = `You said: "${userMessage}".

Here's a code example:

\`\`\`javascript
function greet(name) {
  console.log(\`Hello, \${name}!\`);
  return \`Welcome, \${name}\`;
}

greet("World");
\`\`\`

You can also use inline code like \`console.log()\` in your messages.

Page context (first 100 chars): ${pageContent.substring(0, 100)}...

I am an AI, and I'm still learning!`;
  
  hideLoading();
  displayMessage(llmResponse, 'llm');
}

function displayMessage(message, sender, save = true) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message', sender);
  
  if (sender === 'llm') {
    messageElement.innerHTML = formatMessageWithCode(message);
    messageElement.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', copyCode);
    });
  } else {
    messageElement.textContent = message;
  }
  
  messagesDiv.appendChild(messageElement);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  
  if (save && currentTabId) {
    saveMessage(message, sender);
  }
}

function saveMessage(content, sender) {
  chrome.storage.local.get([`messages_${currentTabId}`], (result) => {
    const messages = result[`messages_${currentTabId}`] || [];
    messages.push({ content, sender });
    chrome.storage.local.set({ [`messages_${currentTabId}`]: messages });
  });
}

function formatMessageWithCode(message) {
  // Replace code blocks (```language\ncode\n```) with formatted HTML
  return message.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, language, code) => {
    const lang = language || 'text';
    const codeId = 'code-' + Math.random().toString(36).substr(2, 9);
    return `
      <div class="code-block">
        <div class="code-header">
          <span>${lang}</span>
          <button class="copy-btn" data-code-id="${codeId}">Copy</button>
        </div>
        <div class="code-content" id="${codeId}">${escapeHtml(code.trim())}</div>
      </div>
    `;
  }).replace(/`([^`]+)`/g, '<code style="background: #161b22; padding: 2px 4px; border-radius: 3px; font-family: \'Roboto Mono\', monospace;">$1</code>');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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

function showLoading() {
  const loadingElement = document.createElement('div');
  loadingElement.classList.add('loading');
  loadingElement.innerHTML = '<div class="horizontal-loader"></div>';
  loadingElement.id = 'loading-indicator';
  messagesDiv.appendChild(loadingElement);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function hideLoading() {
  const loadingElement = document.getElementById('loading-indicator');
  if (loadingElement) {
    loadingElement.remove();
  }
}
