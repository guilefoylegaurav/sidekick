chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPageContent") {
    const pageContent = document.body.innerText;
    sendResponse({ content: pageContent });
  }
});