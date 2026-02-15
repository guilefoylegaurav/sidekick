async function openSidePanelForTab(tab) {
  await chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: 'src/pages/sidepanel.html',
    enabled: true,
  });
  await chrome.sidePanel.open({ tabId: tab.id });
}

function resolveTargetTabId(requestedTabId, callback) {
  if (typeof requestedTabId === 'number') {
    callback(requestedTabId);
    return;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && typeof tabs[0].id === 'number') {
      callback(tabs[0].id);
      return;
    }

    callback(null);
  });
}

function sendMessageToTab(tabId, message, sendResponse, responseTransformer = (response) => response) {
  if (typeof tabId !== 'number') {
    sendResponse({ ok: false, error: 'No target tab available' });
    return;
  }

  chrome.tabs.sendMessage(tabId, message, (response) => {
    if (chrome.runtime.lastError) {
      const errorMessage = chrome.runtime.lastError.message || 'Unknown tab messaging error';
      const hasReceiverError = errorMessage.includes('Receiving end does not exist');

      if (hasReceiverError) {
        // Retry once after injecting the content script.
        chrome.scripting.executeScript(
          {
            target: { tabId },
            files: ['src/scripts/contentScript.js'],
          },
          () => {
            if (chrome.runtime.lastError) {
              console.warn('Error injecting content script into tab', tabId, ':', chrome.runtime.lastError.message);
              sendResponse({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }

            chrome.tabs.sendMessage(tabId, message, (retryResponse) => {
              if (chrome.runtime.lastError) {
                console.warn('Error sending retry message to tab', tabId, ':', chrome.runtime.lastError.message);
                sendResponse({ ok: false, error: chrome.runtime.lastError.message });
                return;
              }

              sendResponse(responseTransformer(retryResponse || {}));
            });
          }
        );
        return;
      }

      console.warn('Error sending message to tab', tabId, ':', errorMessage);
      sendResponse({ ok: false, error: errorMessage });
      return;
    }

    sendResponse(responseTransformer(response || {}));
  });
}

function handleRoutedTabMessage(request, sendResponse, tabMessage, responseTransformer) {
  resolveTargetTabId(request.tabId, (tabId) => {
    sendMessageToTab(tabId, tabMessage, sendResponse, responseTransformer);
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  await openSidePanelForTab(tab);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'requestPageContent') {
    handleRoutedTabMessage(
      request,
      sendResponse,
      { action: 'getPageContent' },
      (response) => ({ content: typeof response.content === 'string' ? response.content : '' })
    );
    return true;
  }

  if (request.action === 'requestPageSnapshot') {
    handleRoutedTabMessage(
      request,
      sendResponse,
      { action: 'getPageSnapshot' },
      (response) => ({ snapshot: response.snapshot || null })
    );
    return true;
  }

  if (request.action === 'executeFillInput') {
    handleRoutedTabMessage(
      request,
      sendResponse,
      {
        action: 'fillInput',
        elementId: request.elementId,
        value: request.value,
        clearFirst: request.clearFirst,
      }
    );
    return true;
  }

  if (request.action === 'executeClickElement') {
    handleRoutedTabMessage(
      request,
      sendResponse,
      {
        action: 'clickElement',
        elementId: request.elementId,
        waitMs: request.waitMs,
      }
    );
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
          action: 'tabRefreshed',
          tabId: tabId,
        });
      }
    });
  }
});
