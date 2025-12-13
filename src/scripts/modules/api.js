// API communication module for LLM requests

import { API_ENDPOINT, API_YOUTUBE_SUBTITLE_ENDPOINT, SYSTEM_PROMPT, JWT_TOKEN_KEY } from './constants.js';

/**
 * Read the JWT token for the current user from chrome.storage.local.
 * @returns {Promise<string|null>}
 */
async function getAuthToken() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([JWT_TOKEN_KEY], (result) => {
        const token = result[JWT_TOKEN_KEY];
        if (typeof token === 'string' && token.length > 0) {
          resolve(token);
        } else {
          resolve(null);
        }
      });
    } catch (error) {
      console.error('Error reading auth token from storage:', error);
      resolve(null);
    }
  });
}

/**
 * LLMClient encapsulates prompt construction and API communication.
 */
export class LLMClient {
  /**
   * @param {string} [endpoint]
   * @param {string} [systemPrompt]
   */
  constructor(endpoint = API_ENDPOINT, systemPrompt = SYSTEM_PROMPT) {
    this.endpoint = endpoint;
    this.systemPrompt = systemPrompt;
  }

  /**
   * Builds a prompt from page content, conversation history, and user message.
   * @param {string} pageContent
   * @param {Array<{content: string, sender: string}>} messages
   * @param {string} userMessage
   * @returns {string}
   */
  buildPrompt(pageContent, messages, userMessage) {
    const promptParts = [this.systemPrompt];

    // Add page context if available
    if (pageContent) {
      promptParts.push(`\n\nPage Context:\n${pageContent}\n`);
    }

    // Add conversation history
    if (messages && messages.length > 0) {
      promptParts.push('Conversation History:');
      messages.forEach((msg) => {
        const role = msg.sender === 'user' ? 'User' : 'Assistant';
        promptParts.push(`${role}: ${msg.content}`);
      });
    }

    // Add the current user message
    promptParts.push(`User: ${userMessage}`);

    return promptParts.join('\n');
  }

  /**
   * Fetches LLM response from the API.
   * Includes the locally stored JWT as a Bearer token when present.
   * @param {string} userMessage
   * @param {string} pageContent
   * @param {Array<{content: string, sender: string}>} messages
   * @returns {Promise<string>}
   */
  async getResponse(userMessage, pageContent, messages) {
    const prompt = this.buildPrompt(pageContent, messages, userMessage);
    const token = await getAuthToken();

    const headers = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt,
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response || data.message || JSON.stringify(data);
  }
}

/**
 * YouTubeClient encapsulates API communication for fetching YouTube subtitles/transcripts.
 */
export class YouTubeClient {
  /**
   * @param {string} [endpoint]
   */
  constructor(endpoint = API_YOUTUBE_SUBTITLE_ENDPOINT) {
    this.endpoint = endpoint;
  }

  /**
   * Fetch just the data the UI cares about for a given YouTube video.
   * Includes the locally stored JWT as a Bearer token when present.
   * @param {string} videoId
   * @param {string} [lang='en']
   * @returns {Promise<{description: string, transcriptionAsText: string}>}
   */
  async getVideoData(videoId, lang = 'en') {
    if (!videoId || typeof videoId !== 'string') {
      throw new Error('videoId is required');
    }

    const token = await getAuthToken();
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const url = new URL(this.endpoint);
    url.searchParams.set('video_id', videoId);
    if (lang) {
      url.searchParams.set('lang', lang);
    }

    const response = await fetch(url.toString(), { method: 'GET', headers });

    let data = null;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }

    if (!response.ok) {
      const message = (data && (data.message || data.error)) || `YouTube subtitles request failed: ${response.status} ${response.statusText}`;
      throw new Error(message);
    }

    const description = data?.data?.[0]?.description || '';
    const transcriptionAsText = data?.transcriptionAsText || '';

    return { description, transcriptionAsText };
  }
}

