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
