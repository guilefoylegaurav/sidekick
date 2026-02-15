// PageContentManager is responsible for fetching structured page snapshots
// and context payloads for given tab IDs.

import { YouTubeClient } from './api.js';

export class PageContentManager {
  constructor() {
    this.youtubeClient = new YouTubeClient();
  }

  /**
   * Capture a structured page snapshot for agentic actions.
   * @param {number|null} [tabId] - Optional tab ID to snapshot.
   * @returns {Promise<{url: string, title: string, pageText: string, interactables: Array<object>, generatedAt: number} | null>}
   */
  async fetchSnapshot(tabId = null) {
    console.log('Fetching page snapshot for tab:', tabId);
    const response = await this._sendRuntimeMessage({ action: 'requestPageSnapshot', tabId });
    return response?.snapshot || null;
  }

  /**
   * Fill an input-like element by the elementId from a page snapshot.
   * @param {{tabId?: number|null, elementId: string, value: string, clearFirst?: boolean}} params
   * @returns {Promise<{ok: boolean, error?: string, elementId?: string, value?: string}>}
   */
  async fillInput({ tabId = null, elementId, value, clearFirst = true }) {
    return this._sendRuntimeMessage({
      action: 'executeFillInput',
      tabId,
      elementId,
      value,
      clearFirst,
    });
  }

  /**
   * Click an element by the elementId from a page snapshot.
   * @param {{tabId?: number|null, elementId: string, waitMs?: number}} params
   * @returns {Promise<{ok: boolean, error?: string, elementId?: string, tag?: string}>}
   */
  async clickElement({ tabId = null, elementId, waitMs }) {
    return this._sendRuntimeMessage({
      action: 'executeClickElement',
      tabId,
      elementId,
      waitMs,
    });
  }

  /**
   * Fetch page snapshots for multiple tabs.
   * @param {number[]} tabIds - Array of tab IDs to fetch snapshots for.
   * @returns {Promise<Array<{tabId: number, title: string, url: string, snapshot: object|null, status: string}>>}
   */
  async fetchSnapshotsForTabs(tabIds) {
    console.log('Fetching page snapshots for tabs:', tabIds);

    if (!Array.isArray(tabIds) || tabIds.length === 0) {
      return [];
    }

    const tabSnapshots = [];

    // Get tab information for all requested tabs
    const tabs = await this._getTabsInfo(tabIds);

    // Fetch snapshot from each tab
    for (const tab of tabs) {
      try {
        // Check if we can access this tab (skip chrome:// and other restricted URLs)
        if (this._isRestrictedUrl(tab.url)) {
          console.log(`Skipping restricted tab ${tab.id}: ${tab.url}`);
          tabSnapshots.push({
            tabId: tab.id,
            title: tab.title || 'Untitled',
            url: tab.url || '',
            snapshot: null,
            status: 'restricted_url',
          });
          continue;
        }

        // If this is a YouTube URL, prefer backend transcript fetch over content-script extraction.
        if (this._isYouTubeUrl(tab.url)) {
          const videoId = this._getYouTubeVideoId(tab.url);

          if (videoId) {
            const videoData = await this.youtubeClient.getVideoData(videoId, 'en');
            const description = videoData?.description || '';
            const transcriptionAsText = videoData?.transcriptionAsText || '';

            tabSnapshots.push({
              tabId: tab.id,
              title: tab.title || 'Untitled',
              url: tab.url || '',
              snapshot: {
                url: tab.url || '',
                title: tab.title || 'Untitled',
                pageText: [
                  description ? `Description:\n${description}` : '',
                  transcriptionAsText ? `Transcript:\n${transcriptionAsText}` : '',
                ]
                  .filter(Boolean)
                  .join('\n\n'),
                interactables: [],
                generatedAt: Date.now(),
              },
              status: 'ok',
            });
            continue;
          }
        }

        // Try to inject content script if needed
        const injectionSuccess = await this._injectContentScriptIfNeeded(tab.id);

        if (!injectionSuccess) {
          console.warn(`Could not inject content script into tab ${tab.id}`);
          tabSnapshots.push({
            tabId: tab.id,
            title: tab.title || 'Untitled',
            url: tab.url || '',
            snapshot: null,
            status: 'injection_failed',
          });
          continue;
        }

        // Wait a brief moment for the content script to initialize
        await new Promise((resolve) => setTimeout(resolve, 100));

        const snapshot = await this.fetchSnapshot(tab.id);
        console.log(
          'Snapshot fetched from tab:',
          tab.id,
          snapshot?.interactables ? `${snapshot.interactables.length} interactables` : 'empty'
        );
        tabSnapshots.push({
          tabId: tab.id,
          title: tab.title || 'Untitled',
          url: tab.url || '',
          snapshot,
          status: snapshot ? 'ok' : 'empty',
        });
      } catch (error) {
        console.error(`Error fetching snapshot from tab ${tab.id}:`, error);
        tabSnapshots.push({
          tabId: tab.id,
          title: tab.title || 'Untitled',
          url: tab.url || '',
          snapshot: null,
          status: 'error',
        });
      }
    }

    return tabSnapshots;
  }

  /**
   * Fetch and serialize page snapshots from multiple tabs into a single prompt context string.
   * @param {number[]} tabIds - Array of tab IDs to fetch snapshots for.
   * @returns {Promise<string>} - Snapshot context for the LLM prompt.
   */
  async fetchSnapshotsContext(tabIds) {
    const tabSnapshots = await this.fetchSnapshotsForTabs(tabIds);

    if (tabSnapshots.length === 0) {
      return '';
    }

    const context = tabSnapshots
      .map((tab) => {
        const safeSnapshot = tab.snapshot || {
          url: tab.url || '',
          title: tab.title || '',
          pageText: '',
          interactables: [],
          generatedAt: Date.now(),
        };

        return [
          `Tab ${tab.tabId}: ${tab.title || 'Untitled'}`,
          `Status: ${tab.status}`,
          JSON.stringify(safeSnapshot),
        ].join('\n');
      })
      .join('\n\n');

    console.log(`Combined snapshots from ${tabSnapshots.length} tabs:`, `${context.substring(0, 200)}...`);
    return context;
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
        const requestedTabs = allTabs.filter((tab) => tabIds.includes(tab.id));
        const tabsInfo = requestedTabs.map((tab) => ({
          id: tab.id,
          title: tab.title || 'Untitled',
          url: tab.url || '',
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
    return (
      url.startsWith('chrome://') ||
      url.startsWith('chrome-extension://') ||
      url.startsWith('edge://') ||
      url.startsWith('about:')
    );
  }

  /**
   * Check if a URL is a YouTube watch/shorts link.
   * @private
   * @param {string} url
   * @returns {boolean}
   */
  _isYouTubeUrl(url) {
    try {
      const parsed = new URL(url);
      const host = (parsed.hostname || '').toLowerCase();
      return host === 'youtu.be' || host.endsWith('youtube.com');
    } catch {
      return false;
    }
  }

  /**
   * Extract a YouTube video id from a URL.
   * Supports youtube.com/watch?v=, youtu.be/, youtube.com/shorts/, youtube.com/embed/.
   * @private
   * @param {string} url
   * @returns {string|null}
   */
  _getYouTubeVideoId(url) {
    try {
      const parsed = new URL(url);
      const host = (parsed.hostname || '').toLowerCase();

      if (host === 'youtu.be') {
        const id = (parsed.pathname || '').split('/').filter(Boolean)[0];
        return id || null;
      }

      if (host.endsWith('youtube.com')) {
        const v = parsed.searchParams.get('v');
        if (v) return v;

        const parts = (parsed.pathname || '').split('/').filter(Boolean);
        // /shorts/:id or /embed/:id or /v/:id
        if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'v') {
          return parts[1] || null;
        }
      }

      return null;
    } catch {
      return null;
    }
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
      console.log('Injecting content script into tab:', tabId);
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['src/scripts/contentScript.js'],
      });

      return true;
    } catch (error) {
      console.warn('Could not inject content script into tab', tabId, ':', error.message);
      return false;
    }
  }

  /**
   * Send a runtime message and normalize error handling.
   * @private
   * @param {Record<string, any>} message
   * @returns {Promise<any>}
   */
  async _sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      const payload = { ...message };

      if (payload.tabId === null || payload.tabId === undefined) {
        delete payload.tabId;
      }

      chrome.runtime.sendMessage(payload, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        resolve(response || { ok: false, error: 'No response from runtime' });
      });
    });
  }
}
