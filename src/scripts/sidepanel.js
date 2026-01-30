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
const MAX_TOOL_STEPS = 10;

// UI layer instances
const chatView = new ChatView({
  messagesContainer: messagesDiv,
  quickActionsContainer,
  userInput,
  sendButton,
  clearButton,
  contextButton: tabsSelectorButton,
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
  tabManager.getCurrentTab().then((tab) => {
    const url = tab?.url || '';
    const isYouTube = /(^|\/\/)(www\.)?(youtube\.com|youtu\.be)\//i.test(url);

    if (isYouTube) {
      chatView.showEmptyState("Chat with YouTube videos too", "What's on this video?");
      return;
    }

    const randomCTA = EMPTY_CTAs[Math.floor(Math.random() * EMPTY_CTAs.length)];
    chatView.showEmptyState(randomCTA);
  });
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

function parseToolCallFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const jsonText = extractJsonObject(text);
  if (!jsonText) return null;

  try {
    const parsed = JSON.parse(jsonText);
    const tool = parsed.tool || parsed.name;
    if (!tool) return null;
    const args = parsed.args || parsed.arguments || {};
    return { tool, args };
  } catch (error) {
    return null;
  }
}

function getToolActionLabel(toolCall) {
  if (!toolCall) return null;
  const actionLabel = toolCall.args?.action_label;
  if (typeof actionLabel === 'string' && actionLabel.trim()) {
    return actionLabel.trim();
  }
  const toolName = toolCall.tool || 'tool';
  return `Running ${toolName.replace(/_/g, ' ')}`;
}

function extractJsonObject(text) {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const startIndex = trimmed.indexOf('{');
  if (startIndex === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < trimmed.length; i += 1) {
    const char = trimmed[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return trimmed.slice(startIndex, i + 1).trim();
      }
    }
  }

  return null;
}

async function executeToolCall(toolCall) {
  console.log('Tool call:', toolCall);
  const tool = toolCall?.tool;
  const args = toolCall?.args || {};
  const tab = await tabManager.getCurrentTab();
  const tabId = tab?.id ?? null;

  switch (tool) {
    case 'get_page_snapshot': {
      const snapshot = await pageContentManager.fetchPageSnapshot(tabId, args.options || {});
      return { ok: !!snapshot, snapshot };
    }
    case 'perform_click': {
      const target = args.target || args.selector || null;
      return pageContentManager.performClick(tabId, target, args.options || {});
    }
    case 'perform_type': {
      const target = args.target || args.selector || null;
      return pageContentManager.performType(tabId, target, args.text, args.options || {});
    }
    default:
      return { ok: false, error: `Unknown tool: ${tool}` };
  }
}

function buildToolResultMessage(tool, result) {
  const payload = {
    tool,
    result,
  };
  return `TOOL_RESULT: ${JSON.stringify(payload)}`;
}

async function getLLMResponse(userMessage) {
  // Show loading animation
  showLoading();
  
  try {
    // Get all prior messages from storage using the helper function
    const messages = await getSavedMessages();

    const tabIds = tabsSelectionController.getSelectedTabIds();

    if (tabIds.length > 10) {
      confirm('You can choose at most ten tabs. Taking the first ten tabs selected.');
      tabIds = tabIds.slice(0, 10);
    }

    const pageContent = await pageContentManager.fetchContent(tabIds);
    
    // Fetch LLM response using the LLM client
    let llmResponse = await llmClient.getResponse(userMessage, pageContent, messages);

    let toolStepCount = 0;
    while (toolStepCount < MAX_TOOL_STEPS) {
      const toolCall = parseToolCallFromText(llmResponse);
      if (!toolCall) {
        break;
      }

      const actionLabel = getToolActionLabel(toolCall);
      if (actionLabel) {
        chatView.displayToolAction(actionLabel);
      }

      const toolResult = await executeToolCall(toolCall);
      const toolMessage = buildToolResultMessage(toolCall.tool, toolResult);
      llmResponse = await llmClient.getResponse(toolMessage, pageContent, messages);
      toolStepCount += 1;
    }

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
