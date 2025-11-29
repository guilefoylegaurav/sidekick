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
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "getPageContent" }, (response) => {
          sendResponse(response);
        });
      }
    });
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
