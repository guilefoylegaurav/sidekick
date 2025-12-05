import { EMPTY_CTAs } from './modules/constants.js';
import { LLMClient } from './modules/api.js';
import { MarkdownRenderer } from './modules/markdown.js';
import { ChromeChatStorage } from './modules/storage.js';
import { ChatView, InputController, QuickActionsController } from './modules/ui.js';
import { TabManager } from './modules/tabManager.js';
import { PageContentManager } from './modules/pageContentManager.js';

const messagesDiv = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const clearButton = document.getElementById('clear-button');
const quickActionsContainer = document.getElementById('quick-actions');

let pageContent = "";
let currentTabId = null;
const chatStorage = new ChromeChatStorage();
const llmClient = new LLMClient();
const markdownRenderer = new MarkdownRenderer();
const pageContentManager = new PageContentManager();

// UI layer instances
const chatView = new ChatView({
  messagesContainer: messagesDiv,
  quickActionsContainer,
  userInput,
  sendButton,
  clearButton,
  markdownRenderer,
});

const inputController = new InputController({
  userInput,
  sendButton,
  clearButton,
  onSend: () => sendMessage(),
  onClear: (force) => clearConversation(force),
});

const quickActionsController = new QuickActionsController({
  container: quickActionsContainer,
  userInput,
  onSend: () => sendMessage(),
});

const tabManager = new TabManager({
  onTabIdChange: (tabId) => {
    currentTabId = tabId;
  },
  onActiveTabChange: () => {
    chatView.clearMessages();
    loadTabData();
  },
  onTabRefreshed: () => {
    handleTabRefresh();
  }
});

// Helper function to get saved messages from storage
function getSavedMessages() {
  return chatStorage.getMessages(currentTabId);
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
  chatView.showEmptyState(randomCTA);
}

// Request page content when the side panel loads
window.addEventListener('load', () => {
  // Verify marked.js is loaded
  if (typeof marked !== 'undefined') {
    console.log('marked.js loaded successfully');
  } else {
    console.error('marked.js failed to load');
  }
  
  pageContentManager.fetchPageContent(currentTabId).then((content) => {
    if (content) {
      pageContent = content;
      console.log("Page content loaded:", pageContent.substring(0, 100) + "...");
    } else {
      console.log("Could not retrieve page content.");
    }
  });

  // Initialize tab management after the page has loaded
  tabManager.init();
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
    // Reset textarea height after clearing
    inputController.resetTextareaHeight();
    getLLMResponse(message);
  }
}

function clearEmptyState() {
  chatView.clearEmptyState();
}

function hideQuickActions() {
  chatView.hideQuickActions();
}

function clearConversation(force = false) {

  if (clearButton.disabled) {
    return;
  }

  // Confirm with user before clearing unless forced
  if (force || confirm('Are you sure you want to clear this conversation?')) {
    // Clear messages from UI
    chatView.clearMessages();
    
    // Clear messages from storage
    if (currentTabId) {
      chatStorage.clearMessages(currentTabId).then(() => {
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
  pageContentManager.fetchPageContent(currentTabId).then((content) => {
    if (content) {
      pageContent = content;
      console.log("Page content reloaded after refresh:", pageContent.substring(0, 100) + "...");
    } else {
      console.log("Could not retrieve page content after refresh.");
    }
  });
}

function scrollToBottom() {
  chatView.scrollToBottom();
}

async function getLLMResponse(userMessage) {
  // Show loading animation
  showLoading();
  
  try {
    // Get all prior messages from storage using the helper function
    const messages = await getSavedMessages();
    
    // Fetch LLM response using the LLM client
    const llmResponse = await llmClient.getResponse(userMessage, pageContent, messages);
    
    hideLoading();
    displayMessage(llmResponse, 'llm');
  } catch (error) {
    hideLoading();
    console.error('Error getting LLM response:', error);
    displayMessage(`Sorry, I encountered an error: ${error.message}. Please make sure the API server is running.`, 'llm');
  }
}

function displayMessage(message, sender, save = true) {
  chatView.displayMessage(message, sender);
  
  if (save && currentTabId) {
    saveMessage(message, sender);
  }
}

function saveMessage(content, sender) {
  if (!currentTabId && currentTabId !== 0) {
    return;
  }
  chatStorage.appendMessage(currentTabId, { content, sender });
}


function showLoading() {
  chatView.showLoading();
}

function hideLoading() {
  chatView.hideLoading();
}
