import { EMPTY_CTAs } from './modules/constants.js';
import { LLMClient } from './modules/api.js';
import { MarkdownRenderer } from './modules/markdown.js';
import { ChromeChatStorage } from './modules/storage.js';
import { ChatView, InputController, QuickActionsController, TabsSelectionController, LogoutButtonController } from './modules/ui.js';
import { TabManager } from './modules/tabManager.js';
import { PageContentManager } from './modules/pageContentManager.js';
import { ensureAuthenticated } from './modules/auth.js';

const messagesDiv = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const clearButton = document.getElementById('clear-button');
const quickActionsContainer = document.getElementById('quick-actions');
const tabsSelectorButton = document.getElementById('tabs-selector-button');
const logoutButton = document.getElementById('logout-button');

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

// Tabs selector controller for header menu
const tabsSelectionController = new TabsSelectionController({
  button: tabsSelectorButton,
  tabManager,
});

// Logout button controller for auth
const logoutButtonController = new LogoutButtonController({
  button: logoutButton,
});


// Connect TabManager to TabsSelectionController after both are created
tabManager.onTabIdChange = (tabId) => {
  currentTabId = tabId;
  // Also update the tabs selection controller
  tabsSelectionController.setSelectedTabIds([tabId]);
};

// Update onActiveTabChange to also update TabsSelectionController
tabManager.onActiveTabChange = () => {
  chatView.clearMessages();
  loadTabData();

  // Close any open dropdown on tab refresh
  tabsSelectionController.closeDropdown();

  // Update tabs selection controller for tab switches
  if (currentTabId !== null) {
    tabsSelectionController.setSelectedTabIds([currentTabId]);
  }
};

// Update onTabRefreshed to close dropdown and update TabsSelectionController
tabManager.onTabRefreshed = () => {
  handleTabRefresh();
  // Close any open dropdown on tab refresh
  tabsSelectionController.closeDropdown();
  // Update tabs selection controller
  if (currentTabId !== null) {
    tabsSelectionController.setSelectedTabIds([currentTabId]);
  }
};

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
  // Before doing anything else, ensure the user is authenticated.
  // If not, this will redirect to the login page.
  ensureAuthenticated();

  // Verify marked.js is loaded
  if (typeof marked !== 'undefined') {
    console.log('marked.js loaded successfully');
  } else {
    console.error('marked.js failed to load');
  }

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
}

async function getLLMResponse(userMessage) {
  // Show loading animation
  showLoading();
  
  try {
    // Get all prior messages from storage using the helper function
    const messages = await getSavedMessages();

    const pageContent = await pageContentManager.fetchContent(tabsSelectionController.getSelectedTabIds());
    
    // Fetch LLM response using the LLM client
    const llmResponse = await llmClient.getResponse(userMessage, pageContent, messages);
    
    hideLoading();
    displayMessage(llmResponse, 'llm');
  } catch (error) {
    hideLoading();
    console.error('Error getting LLM response:', error);
    displayMessage(`Whoops. Hit the rate limit. Try again after a few minutes maybe?`, 'llm');
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
