chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPageContent") {
    const pageContent = document.body.innerText;
    sendResponse({ content: pageContent });
  } else if (request.action === "ping") {
    // Respond to ping to indicate content script is present
    sendResponse({ status: "ready" });
  }
});