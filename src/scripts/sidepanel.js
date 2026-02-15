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
const agentSessionIndicator = document.getElementById('agent-session-indicator');

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
  contextButton: tabsSelectorButton,
  agentStatusElement: agentSessionIndicator,
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

function normalizeToolName(name) {
  if (typeof name !== 'string') {
    return '';
  }
  return name.trim().toLowerCase();
}

function resolveToolTabId(toolArgs, selectedTabIds) {
  if (toolArgs && typeof toolArgs.tabId === 'number') {
    return toolArgs.tabId;
  }

  if (Array.isArray(selectedTabIds) && selectedTabIds.length > 0 && typeof selectedTabIds[0] === 'number') {
    return selectedTabIds[0];
  }

  if (typeof currentTabId === 'number') {
    return currentTabId;
  }

  return null;
}

async function executeToolCall(toolCall, selectedTabIds) {
  const toolName = normalizeToolName(toolCall?.name);
  const toolArgs = (toolCall && toolCall.arguments && typeof toolCall.arguments === 'object')
    ? toolCall.arguments
    : {};

  const targetTabId = resolveToolTabId(toolArgs, selectedTabIds);

  switch (toolName) {
    case 'get_page_snapshot':
    case 'page_snapshot': {
      const snapshot = await pageContentManager.fetchSnapshot(targetTabId);
      return {
        ok: !!snapshot,
        toolName,
        snapshot,
        targetTabId,
        error: snapshot ? undefined : 'Snapshot was empty',
      };
    }
    case 'fill_input':
    case 'fillinput': {
      const elementId = typeof toolArgs.elementId === 'string' ? toolArgs.elementId : '';
      const value = typeof toolArgs.value === 'string' ? toolArgs.value : String(toolArgs.value ?? '');
      const clearFirst = toolArgs.clearFirst !== false;

      if (!elementId) {
        return { ok: false, toolName, error: 'fill_input requires elementId' };
      }

      return pageContentManager.fillInput({
        tabId: targetTabId,
        elementId,
        value,
        clearFirst,
      });
    }
    case 'click_element':
    case 'click': {
      const elementId = typeof toolArgs.elementId === 'string' ? toolArgs.elementId : '';
      const waitMs = typeof toolArgs.waitMs === 'number' ? toolArgs.waitMs : undefined;

      if (!elementId) {
        return { ok: false, toolName, error: 'click_element requires elementId' };
      }

      return pageContentManager.clickElement({
        tabId: targetTabId,
        elementId,
        waitMs,
      });
    }
    default:
      return {
        ok: false,
        toolName,
        error: `Unsupported tool: ${toolCall?.name || 'unknown'}`,
      };
  }
}

function formatToolExecutionMessage(toolCall, toolResult) {
  const toolName = toolCall?.name || 'unknown_tool';
  if (!toolResult || toolResult.ok === false) {
    return `Tool call failed for ${toolName}: ${toolResult?.error || 'Unknown error'}`;
  }

  const normalizedName = normalizeToolName(toolName);
  if (normalizedName === 'get_page_snapshot' || normalizedName === 'page_snapshot') {
    const interactableCount = Array.isArray(toolResult.snapshot?.interactables)
      ? toolResult.snapshot.interactables.length
      : 0;
    return `Captured page snapshot successfully (${interactableCount} interactable elements).`;
  }

  if (normalizedName === 'fill_input' || normalizedName === 'fillinput') {
    return `Filled input for elementId=${toolResult.elementId || 'unknown'}.`;
  }

  if (normalizedName === 'click_element' || normalizedName === 'click') {
    return `Clicked elementId=${toolResult.elementId || 'unknown'}.`;
  }

  return `Tool ${toolName} executed successfully.`;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getLLMResponse(userMessage) {
  // Show loading animation
  showLoading();
  chatView.setToolSessionState(false);
  
  try {
    // Get all prior messages from storage using the helper function
    const messages = await getSavedMessages();

    let tabIds = tabsSelectionController.getSelectedTabIds();

    if (tabIds.length > 10) {
      confirm('You can choose at most ten tabs. Taking the first ten tabs selected.');
      tabIds = tabIds.slice(0, 10);
    }

    const maxToolSteps = 5;
    const toolExecutionHistory = [];
    let nextUserMessage = userMessage;

    for (let step = 0; step <= maxToolSteps; step++) {
      const pageSnapshotsContext = await pageContentManager.fetchSnapshotsContext(tabIds);

      // Fetch LLM response using the LLM client
      const llmResponse = await llmClient.getResponse(nextUserMessage, pageSnapshotsContext, messages);
      const parsedResponse = llmClient.parseModelResponse(llmResponse);

      if (!parsedResponse.toolCall) {
        hideLoading();
        displayMessage(parsedResponse.assistantMessage || llmResponse, 'llm');
        return;
      }

      chatView.setToolSessionState(true, {
        step: step + 1,
        maxSteps: maxToolSteps + 1,
        toolName: parsedResponse.toolCall.name || '',
      });

      const toolResult = await executeToolCall(parsedResponse.toolCall, tabIds);
      const toolMessage = formatToolExecutionMessage(parsedResponse.toolCall, toolResult);

      toolExecutionHistory.push({
        toolCall: parsedResponse.toolCall,
        toolResult,
        toolMessage,
      });

      // If tool execution fails, stop the loop and report immediately.
      if (!toolResult || toolResult.ok === false) {
        hideLoading();
        displayMessage(toolMessage, 'llm');
        return;
      }

      if (step === maxToolSteps) {
        hideLoading();
        displayMessage('Reached the tool execution limit before finishing. Try again with a narrower request.', 'llm');
        return;
      }

      const toolHistoryPayload = JSON.stringify(toolExecutionHistory);
      nextUserMessage = [
        `Original user intent: ${userMessage}`,
        `Tool execution history (latest included): ${toolHistoryPayload}`,
        'Continue the task based on these tool results.',
        'If another browser action is required, return ONLY valid JSON in this format:',
        '{"tool_call":{"name":"<tool_name>","arguments":{...}}}',
        'If no more tools are needed, return the final response to the user in plain text.',
      ].join('\n\n');

      // Give the page some time to load/update before next agent step.
      await wait(2000);
    }
  } catch (error) {
    hideLoading();
    console.error('Error getting LLM response:', error);
    displayMessage(`Whoops. Hit the rate limit. Try again after a few minutes maybe?`, 'llm');
  } finally {
    chatView.setToolSessionState(false);
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
