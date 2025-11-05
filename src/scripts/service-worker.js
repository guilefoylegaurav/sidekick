chrome.action.onClicked.addListener(async (tab) => {
  // Ensure the side panel opens for the current tab
  await chrome.sidePanel.open({ tabId: tab.id });
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "sidepanel.html"
  });
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
