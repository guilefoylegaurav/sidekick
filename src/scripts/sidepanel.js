const messagesDiv = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');

let pageContent = "";
let currentTabId = null;

const emptyCTAs = [
  "What's the story here?",
  "Surprise me with insights",
  "Break this down for me",
  "Give me the TL;DR", 
  "Spill the tea ☕",
  "What's the plot twist?",
  "Make this make sense",
  "What am I missing?",
  "Connect the dots",
  "Be my reading buddy"
];

// Get current tab ID and load tab-specific data
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]) {
    currentTabId = tabs[0].id;
    loadTabData();
  }
});

// Add event listeners for quick action buttons
document.addEventListener('DOMContentLoaded', () => {
  const quickActionButtons = document.querySelectorAll('.quick-action-btn');
  quickActionButtons.forEach(button => {
    button.addEventListener('click', () => {
      const prompt = button.getAttribute('data-prompt');
      if (prompt) {
        // Set the prompt in the input field and trigger send
        userInput.value = prompt;
        sendMessage();
      }
    });
  });
});

function loadTabData() {
  chrome.storage.local.get([`messages_${currentTabId}`], (result) => {
    const savedMessages = result[`messages_${currentTabId}`] || [];
    savedMessages.forEach(msg => displayMessage(msg.content, msg.sender, false));
    
    if (savedMessages.length === 0) {
      showEmptyState();
    } else {
      hideQuickActions();
    }
  });
}

function showEmptyState() {
  const randomCTA = emptyCTAs[Math.floor(Math.random() * emptyCTAs.length)];
  const emptyElement = document.createElement('div');
  emptyElement.classList.add('empty-state');
  emptyElement.innerHTML = `
    <div class="empty-content">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <p class="empty-message">${randomCTA}</p>
      <p class="empty-subtitle">Ask me anything about this page</p>
    </div>
  `;
  messagesDiv.appendChild(emptyElement);
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
    clearEmptyState();
    hideQuickActions();
    displayMessage(message, 'user');
    userInput.value = '';
    getLLMResponse(message);
  }
}

function clearEmptyState() {
  const emptyState = document.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }
}

function hideQuickActions() {
  const quickActions = document.getElementById('quick-actions');
  if (quickActions) {
    quickActions.classList.add('hidden');
  }
}

function scrollToBottom() {
  // Use setTimeout to ensure DOM has fully updated
  setTimeout(() => {
    console.log('Scrolling to bottom...', {
      messagesHeight: messagesDiv.scrollHeight,
      messagesTop: messagesDiv.scrollTop,
      messagesClientHeight: messagesDiv.clientHeight
    });
    
    // Try scrolling the messages container
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    // Also try scrolling the chat container
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    // Try scrolling the body as well
    document.body.scrollTop = document.body.scrollHeight;
    document.documentElement.scrollTop = document.documentElement.scrollHeight;
    
    console.log('After scroll attempt:', messagesDiv.scrollTop);
  }, 100);
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
  scrollToBottom();
  
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
  scrollToBottom();
}

function hideLoading() {
  const loadingElement = document.getElementById('loading-indicator');
  if (loadingElement) {
    loadingElement.remove();
  }
}
