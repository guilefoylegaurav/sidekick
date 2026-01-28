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

  if (request.action === "requestPageSnapshot") {
    const targetTabId = request.tabId;
    const options = request.options || {};

    const sendRequestToTab = (tabId) => {
      if (!tabId && tabId !== 0) {
        sendResponse({ snapshot: null });
        return;
      }
      chrome.tabs.sendMessage(tabId, { action: "getPageSnapshot", options }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("Error sending snapshot request to tab", tabId, ":", chrome.runtime.lastError.message);
          sendResponse({ snapshot: null, error: chrome.runtime.lastError.message });
        } else {
          sendResponse(response || { snapshot: null });
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
          sendResponse({ snapshot: null });
        }
      });
    }
    return true; // Required for asynchronous sendResponse
  }

  if (request.action === "performClick") {
    const targetTabId = request.tabId;
    const target = request.target || null;
    const options = request.options || {};

    const sendRequestToTab = (tabId) => {
      chrome.tabs.sendMessage(tabId, { action: "performClick", target, options }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("Error sending click request to tab", tabId, ":", chrome.runtime.lastError.message);
          sendResponse({ result: { ok: false, error: chrome.runtime.lastError.message } });
        } else if (response && response.result) {
          sendResponse(response);
        } else {
          sendResponse({ result: { ok: false, error: 'No response' }});
        }
      });
    };
    sendRequestToTab(targetTabId);
    return true;
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
