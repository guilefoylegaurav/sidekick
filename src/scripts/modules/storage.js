// Chat storage abstractions and Chrome implementation

/**
 * @typedef {Object} ChatMessage
 * @property {string} content
 * @property {'user' | 'llm'} sender
 * @property {number} [timestamp]
 */

/**
 * @typedef {Object} IChatStorage
 * @property {(tabId: number) => Promise<ChatMessage[]>} getMessages
 * @property {(tabId: number, message: ChatMessage) => Promise<void>} appendMessage
 * @property {(tabId: number, messages: ChatMessage[]) => Promise<void>} setMessages
 * @property {(tabId: number) => Promise<void>} clearMessages
 */

/**
 * Chrome-based implementation of IChatStorage using chrome.storage.local.
 */
export class ChromeChatStorage {
  /**
   * @param {chrome.storage.StorageArea} [storageArea]
   * @param {string} [storageKeyPrefix]
   */
  constructor(storageArea = chrome.storage.session, storageKeyPrefix = 'messages_') {
    this.storageArea = storageArea;
    this.storageKeyPrefix = storageKeyPrefix;
  }

  /**
   * @param {number} tabId
   * @returns {string}
   * @private
   */
  _key(tabId) {
    return `${this.storageKeyPrefix}${tabId}`;
  }

  /**
   * @param {number} tabId
   * @returns {Promise<ChatMessage[]>}
   */
  async getMessages(tabId) {
    if (!tabId && tabId !== 0) {
      return [];
    }

    const key = this._key(tabId);
    return new Promise((resolve) => {
      this.storageArea.get([key], (result) => {
        resolve(result[key] || []);
      });
    });
  }

  /**
   * @param {number} tabId
   * @param {ChatMessage} message
   * @returns {Promise<void>}
   */
  async appendMessage(tabId, message) {
    const messages = await this.getMessages(tabId);
    const withTimestamp = {
      ...message,
      timestamp: message.timestamp ?? Date.now(),
    };
    messages.push(withTimestamp);
    await this.setMessages(tabId, messages);
  }

  /**
   * @param {number} tabId
   * @param {ChatMessage[]} messages
   * @returns {Promise<void>}
   */
  async setMessages(tabId, messages) {
    if (!tabId && tabId !== 0) {
      return;
    }

    const key = this._key(tabId);
    return new Promise((resolve) => {
      this.storageArea.set({ [key]: messages }, () => resolve());
    });
  }

  /**
   * @param {number} tabId
   * @returns {Promise<void>}
   */
  async clearMessages(tabId) {
    if (!tabId && tabId !== 0) {
      return;
    }

    const key = this._key(tabId);
    return new Promise((resolve) => {
      this.storageArea.remove(key, () => resolve());
    });
  }
}


