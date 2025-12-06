chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "src/pages/sidepanel.html",
    enabled: true
  });
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "requestPageContent") {
    const targetTabId = request.tabId;

    const sendRequestToTab = (tabId) => {
      if (!tabId && tabId !== 0) {
        sendResponse({ content: '' });
        return;
      }
      chrome.tabs.sendMessage(tabId, { action: "getPageContent" }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("Error sending message to tab", tabId, ":", chrome.runtime.lastError.message);
          sendResponse({ content: '' });
        } else {
          sendResponse(response || { content: '' });
        }
      });
    };

    if (typeof targetTabId === 'number') {
      sendRequestToTab(targetTabId);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          sendRequestToTab(tabs[0].id);
        } else {
          sendResponse({ content: '' });
        }
      });
    }
    return true; // Required for asynchronous sendResponse
  }
});

// Listen for tab updates to detect refreshes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if the tab has finished loading and is the active tab
  if (changeInfo.status === 'complete') {
    // Send a message to the side panel to notify about the refresh
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id === tabId) {
        // Notify the side panel that the tab has been refreshed
        chrome.runtime.sendMessage({
          action: "tabRefreshed",
          tabId: tabId
        });
      }
    });
  }
});
