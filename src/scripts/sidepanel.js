import { EMPTY_CTAs } from './modules/constants.js';
import { getLLMResponse as fetchLLMResponse } from './modules/api.js';
import { formatMessageWithCode } from './modules/markdown.js';

const messagesDiv = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const clearButton = document.getElementById('clear-button');

let pageContent = "";
let currentTabId = null;

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

// Listen for tab refresh notifications from the service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "tabRefreshed") {
    // Only handle refresh for the current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id === request.tabId) {
        handleTabRefresh();
      }
    });
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
  const randomCTA = EMPTY_CTAs[Math.floor(Math.random() * EMPTY_CTAs.length)];
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
clearButton.addEventListener('click', clearConversation);
userInput.addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    sendMessage();
  }
});

function sendMessage() {
  if (sendButton.disabled) {
    return;
  }
  
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

function clearConversation(force = false) {

  if (clearButton.disabled) {
    return;
  }

  // Confirm with user before clearing unless forced
  if (force || confirm('Are you sure you want to clear this conversation?')) {
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

function handleTabRefresh() {
  // Clear conversation without confirmation
  clearConversation(true);
  
  // Repopulate page content
  chrome.runtime.sendMessage({ action: "requestPageContent" }, (response) => {
    if (response && response.content) {
      pageContent = response.content;
      console.log("Page content reloaded after refresh:", pageContent.substring(0, 100) + "...");
    } else {
      console.log("Could not retrieve page content after refresh.");
    }
  });
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
    
    // Fetch LLM response using the API module
    const llmResponse = await fetchLLMResponse(userMessage, pageContent, messages);
    
    hideLoading();
    displayMessage(llmResponse, 'llm');
  } catch (error) {
    hideLoading();
    console.error('Error getting LLM response:', error);
    displayMessage(`Sorry, I encountered an error: ${error.message}. Please make sure the API server is running.`, 'llm');
  }
}

function displayMessage(message, sender, save = true) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message', sender);
  
  // Format markdown and attach copy button listeners
  // formatMessageWithCode will set innerHTML and attach listeners automatically
  formatMessageWithCode(message, messageElement);
  
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


function disableButton(button, isDisabled) {
  if (!button) {
    return;
  }
  button.disabled = isDisabled;
  button.classList.toggle('disabled', isDisabled);
}

function showLoading() {
  disableButton(sendButton, true);
  disableButton(clearButton, true);
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
  disableButton(sendButton, false);
  disableButton(clearButton, false);
}
