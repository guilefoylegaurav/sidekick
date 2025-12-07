// PageContentManager is responsible for fetching page content
// for given tab IDs.

export class PageContentManager {
  /**
   * Fetch page content for a specific tab or the current active tab.
   * @param {number|null} [tabId] - Optional tab ID to fetch content for.
   * @returns {Promise<string>} - The page content (may be empty string).
   */
  async fetchPageContent(tabId = null) {
    console.log("Fetching page content for tab:", tabId);
    return new Promise((resolve) => {
      const message = { action: 'requestPageContent' };
      if (tabId !== null && tabId !== undefined) {
        message.tabId = tabId;
      }

      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("Runtime error fetching content:", chrome.runtime.lastError.message);
          resolve('');
          return;
        }
        
        if (response && typeof response.content === 'string') {
          resolve(response.content);
        } else {
          resolve('');
        }
      });
    });
  }

  /**
   * Fetch page content for multiple tabs.
   * @param {number[]} tabIds - Array of tab IDs to fetch content for.
   * @returns {Promise<Array<{tabId: number, title: string, content: string}>>} - Array of tab content objects.
   */
  async fetchMultipleTabsContent(tabIds) {
    console.log("Fetching page content for tabs:", tabIds);
    
    if (!Array.isArray(tabIds) || tabIds.length === 0) {
      return [];
    }

    const tabContents = [];

    // Get tab information for all requested tabs
    const tabs = await this._getTabsInfo(tabIds);

    // Fetch content from each tab
    for (const tab of tabs) {
      try {
        // Check if we can access this tab (skip chrome:// and other restricted URLs)
        if (this._isRestrictedUrl(tab.url)) {
          console.log(`Skipping restricted tab ${tab.id}: ${tab.url}`);
          tabContents.push({
            tabId: tab.id,
            title: tab.title || 'Untitled',
            content: '[Content not accessible - restricted URL]'
          });
          continue;
        }

        // Try to inject content script if needed
        const injectionSuccess = await this._injectContentScriptIfNeeded(tab.id);
        
        if (!injectionSuccess) {
          console.warn(`Could not inject content script into tab ${tab.id}`);
          tabContents.push({
            tabId: tab.id,
            title: tab.title || 'Untitled',
            content: '[Content not accessible - injection failed]'
          });
          continue;
        }

        // Wait a brief moment for the content script to initialize
        await new Promise(resolve => setTimeout(resolve, 100));

        const content = await this.fetchPageContent(tab.id);
        console.log("Content fetched from tab:", tab.id, content ? `${content.length} characters` : 'empty');
        tabContents.push({
          tabId: tab.id,
          title: tab.title || 'Untitled',
          content: content || '[No content available]'
        });
      } catch (error) {
        console.error(`Error fetching content from tab ${tab.id}:`, error);
        tabContents.push({
          tabId: tab.id,
          title: tab.title || 'Untitled',
          content: '[Error accessing content]'
        });
      }
    }

    return tabContents;
  }

  /**
   * Fetch and combine page content from multiple tabs into a single string.
   * @param {number[]} tabIds - Array of tab IDs to fetch content for.
   * @returns {Promise<string>} - Combined content from all tabs.
   */
  async fetchCombinedTabsContent(tabIds) {
    const tabContents = await this.fetchMultipleTabsContent(tabIds);
    
    if (tabContents.length === 0) {
      return '';
    }

    // Combine content from all tabs with clear separators
    const combinedContent = tabContents
      .map((tab, index) => {
        return tab.content;
      })
      .join('\n\n');

    console.log(`Combined content from ${tabContents.length} tabs:`, combinedContent.substring(0, 200) + "...");
    return combinedContent;
  }

  /**
   * Get tab information for the specified tab IDs.
   * @private
   * @param {number[]} tabIds - Array of tab IDs.
   * @returns {Promise<Array<{id: number, title: string, url: string}>>} - Array of tab info objects.
   */
  async _getTabsInfo(tabIds) {
    return new Promise((resolve) => {
      chrome.tabs.query({}, (allTabs) => {
        const requestedTabs = allTabs.filter(tab => tabIds.includes(tab.id));
        const tabsInfo = requestedTabs.map(tab => ({
          id: tab.id,
          title: tab.title || 'Untitled',
          url: tab.url || ''
        }));
        resolve(tabsInfo);
      });
    });
  }

  /**
   * Check if a URL is restricted and cannot have content scripts injected.
   * @private
   * @param {string} url - The URL to check.
   * @returns {boolean} - True if the URL is restricted.
   */
  _isRestrictedUrl(url) {
    if (!url) return false;
    return url.startsWith('chrome://') || 
           url.startsWith('chrome-extension://') || 
           url.startsWith('edge://') || 
           url.startsWith('about:');
  }

  /**
   * Inject content script into a tab if it's not already injected.
   * @private
   * @param {number} tabId - The tab ID to inject the script into.
   * @returns {Promise<boolean>} - True if injection was successful or already present.
   */
  async _injectContentScriptIfNeeded(tabId) {
    try {
      // First, try to ping the existing content script
      const pingResult = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action: 'ping' }, (response) => {
          if (chrome.runtime.lastError) {
            resolve(false); // Content script not present
          } else {
            resolve(true); // Content script is present
          }
        });
      });

      if (pingResult) {
        return true; // Content script already present
      }

      // Content script not present, try to inject it
      console.log("Injecting content script into tab:", tabId);
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['src/scripts/contentScript.js']
      });

      return true;
    } catch (error) {
      console.warn("Could not inject content script into tab", tabId, ":", error.message);
      return false;
    }
  }
}