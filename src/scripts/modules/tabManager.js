// TabManager handles tab-related session behavior:
// - determining the current active tab
// - reacting to tab switches
// - reacting to tab refresh notifications from the service worker

export class TabManager {
  /**
   * @param {{
   *   onTabIdChange: (tabId: number) => void,
   *   onActiveTabChange?: () => void,
   *   onTabRefreshed?: () => void
   * }} deps
   */
  constructor({ onTabIdChange, onActiveTabChange, onTabRefreshed }) {
    this.onTabIdChange = onTabIdChange;
    this.onActiveTabChange = onActiveTabChange;
    this.onTabRefreshed = onTabRefreshed;

    this._handleTabActivated = this._handleTabActivated.bind(this);
    this._handleRuntimeMessage = this._handleRuntimeMessage.bind(this);
  }

  /**
   * Initialize the current tab and register listeners.
   */
  init() {
    // Get current tab ID
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        this.onTabIdChange(tabs[0].id);
        if (typeof this.onActiveTabChange === 'function') {
          this.onActiveTabChange();
        }
      }
    });

    // Listen for tab activation to handle switching between tabs
    chrome.tabs.onActivated.addListener(this._handleTabActivated);

    // Listen for tab refresh notifications from the service worker
    chrome.runtime.onMessage.addListener(this._handleRuntimeMessage);
  }

  /**
   * Handle tab activation events.
   * @param {{tabId: number}} activeInfo
   */
  _handleTabActivated(activeInfo) {
    this.onTabIdChange(activeInfo.tabId);
    if (typeof this.onActiveTabChange === 'function') {
      this.onActiveTabChange();
    }
  }

  /**
   * Handle runtime messages (e.g., tabRefreshed from the service worker).
   */
  _handleRuntimeMessage(request, sender, sendResponse) {
    if (request.action === 'tabRefreshed') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id === request.tabId) {
          if (typeof this.onTabRefreshed === 'function') {
            this.onTabRefreshed();
          }
        }
      });
    }
  }

  /**
   * Get all tabs in the browser with their ids and titles.
   * @returns {Promise<Array<{id: number, title: string}>>}
   */
  async getAllTabs() {
    return new Promise((resolve) => {
      chrome.tabs.query({}, (tabs) => {
        const simplified = tabs
          .filter((tab) => typeof tab.id === 'number')
          .map((tab) => ({
            id: tab.id,
            title: tab.title || '',
          }));
        resolve(simplified);
      });
    });
  }
}



