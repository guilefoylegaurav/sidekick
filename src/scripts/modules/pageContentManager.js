// PageContentManager is responsible for fetching page content
// for a given tab (or the current active tab if no tabId is provided).

export class PageContentManager {
  /**
   * Fetch page content for a specific tab or the current active tab.
   * @param {number|null} [tabId] - Optional tab ID to fetch content for.
   * @returns {Promise<string>} - The page content (may be empty string).
   */
  async fetchPageContent(tabId = null) {
    return new Promise((resolve) => {
      const message = { action: 'requestPageContent' };
      if (tabId !== null && tabId !== undefined) {
        message.tabId = tabId;
      }

      chrome.runtime.sendMessage(message, (response) => {
        if (response && typeof response.content === 'string') {
          resolve(response.content);
        } else {
          resolve('');
        }
      });
    });
  }
}


