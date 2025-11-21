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
  "Spill the tea!",
  "What's the plot twist?",
  "Make this make sense",
  "What am I missing?",
  "Connect the dots",
  "Be my reading buddy"
];

// Get current tab ID and load tab-specific data
function getCurrentTabAndLoadData() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      currentTabId = tabs[0].id;
      loadTabData();
    }
  });
}

// Load data when side panel opens
getCurrentTabAndLoadData();

// Listen for tab activation to handle switching between tabs
chrome.tabs.onActivated.addListener((activeInfo) => {
  // Update current tab ID when a new tab is activated
  currentTabId = activeInfo.tabId;
  // Clear current messages and load data for the new tab
  messagesDiv.innerHTML = '';
  loadTabData();
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

// Helper function to get saved messages from storage
function getSavedMessages() {
  return new Promise((resolve) => {
    chrome.storage.local.get([`messages_${currentTabId}`], (result) => {
      resolve(result[`messages_${currentTabId}`] || []);
    });
  });
}

function loadTabData() {
  getSavedMessages().then((savedMessages) => {
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
  const quickActions = document.getElementById('quick-actions');
  if (quickActions) {
    quickActions.classList.remove('hidden');
  }
}

// Request page content when the side panel loads
window.addEventListener('load', () => {
  // Verify marked.js is loaded
  if (typeof marked !== 'undefined') {
    console.log('marked.js loaded successfully');
  } else {
    console.error('marked.js failed to load');
  }
  
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

// Add clear button functionality
document.addEventListener('DOMContentLoaded', () => {
  const clearButton = document.getElementById('clear-button');
  if (clearButton) {
    clearButton.addEventListener('click', clearConversation);
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

function clearConversation() {
  // Confirm with user before clearing
  if (confirm('Are you sure you want to clear this conversation?')) {
    // Clear messages from UI
    messagesDiv.innerHTML = '';
    
    // Clear messages from storage
    if (currentTabId) {
      chrome.storage.local.remove(`messages_${currentTabId}`, () => {
        console.log('Conversation cleared for tab:', currentTabId);
      });
    }
    
    // Show empty state and quick actions
    showEmptyState();
  }
}

function scrollToBottom() {
  const scroll = () => {

    const lastElement = messagesDiv.lastElementChild;
    if (lastElement) {
      lastElement.scrollIntoView({ block: 'end' });
    }

  };

  scroll();
}

async function getLLMResponse(userMessage) {
  // Show loading animation
  showLoading();
  
  try {
    // Get all prior messages from storage using the helper function
    const messages = await getSavedMessages();
    
    // Build the prompt with page context and conversation history using an array
    const promptParts = [];
    
    // Add page context if available
    if (pageContent) {
      promptParts.push(`Page Context:\n${pageContent}\n`);
    }
    
    // Add conversation history
    if (messages.length > 0) {
      promptParts.push('Conversation History:');
      messages.forEach(msg => {
        const role = msg.sender === 'user' ? 'User' : 'Assistant';
        promptParts.push(`${role}: ${msg.content}`);
      });
    }
    
    // Add the current user message
    promptParts.push(`User: ${userMessage}`);
    
    const prompt = promptParts.join('\n');
    
    // Make POST request to the API endpoint
    const response = await fetch('http://localhost:3000/api/get_llm_response', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        prompt: prompt
      })
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const llmResponse = data.response || data.message || JSON.stringify(data);
    
    hideLoading();
    displayMessage(llmResponse, 'llm');
  } catch (error) {
    hideLoading();
    console.error('Error getting LLM response:', error);
    displayMessage(`Sorry, I encountered an error: ${error.message}. Please make sure the API server is running at localhost:3000.`, 'llm');
  }
}

function displayMessage(message, sender, save = true) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message', sender);
  
  // Format markdown for both user and LLM messages
  messageElement.innerHTML = formatMessageWithCode(message);
  messageElement.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', copyCode);
  });
  
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
  // Check if marked is available
  if (typeof marked === 'undefined') {
    console.warn('marked.js not loaded, using basic formatting');
    return escapeHtml(message).replace(/\n/g, '<br>');
  }
  
  // Parse markdown using marked.js
  let html = marked.parse(message);
  
  // Post-process code blocks to add our custom wrapper with copy button
  html = html.replace(/<pre><code(?:\s+class="language-(\w+)")?>([\s\S]*?)<\/code><\/pre>/g, (match, language, code) => {
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
  });
  
  return html;
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
