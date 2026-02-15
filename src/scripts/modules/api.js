// API communication module for LLM requests

import { API_ENDPOINT, API_YOUTUBE_SUBTITLE_ENDPOINT, SYSTEM_PROMPT, JWT_TOKEN_KEY } from './constants.js';
import { Cache } from './cache.js';

const TOOL_CALLING_INSTRUCTIONS = `
Tooling policy:
- If the user asks to inspect or interact with a page element, call a tool instead of guessing.
- If the user only asks a normal question, answer directly in natural language.

Available tools:
1) get_page_snapshot
   arguments: { "tabId"?: number }
   use for: getting current interactable elements/state before taking actions.

2) fill_input
   arguments: { "tabId"?: number, "elementId": string, "value": string, "clearFirst"?: boolean }
   use for: filling input/textarea/contenteditable fields.

3) click_element
   arguments: { "tabId"?: number, "elementId": string, "waitMs"?: number }
   use for: clicking buttons/links or other clickable elements.

Response contract:
- If a tool is needed, respond with ONLY valid JSON:
{"tool_call":{"name":"<tool_name>","arguments":{...}}}
- If no tool is needed, respond with normal text only.
`;

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
   * Builds a prompt from page context, conversation history, and user message.
   * @param {string} pageContext
   * @param {Array<{content: string, sender: string}>} messages
   * @param {string} userMessage
   * @returns {string}
   */
  buildPrompt(pageContext, messages, userMessage) {
    const promptParts = [this.systemPrompt];

    // Add page context if available
    if (pageContext) {
      promptParts.push(`\n\nPage Context:\n${pageContext}\n`);
    }

    // Add tool usage contract.
    promptParts.push(`\n\n${TOOL_CALLING_INSTRUCTIONS}\n`);

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
   * @param {string} pageContext
   * @param {Array<{content: string, sender: string}>} messages
   * @returns {Promise<string>}
   */
  async getResponse(userMessage, pageContext, messages) {
    const prompt = this.buildPrompt(pageContext, messages, userMessage);
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

  /**
   * Parse model response and extract a tool call when present.
   * Falls back to plain assistant text when no valid tool payload is found.
   * @param {string|object} rawResponse
   * @returns {{assistantMessage: string, toolCall: {name: string, arguments: Record<string, any>}|null, rawText: string}}
   */
  parseModelResponse(rawResponse) {
    const rawText = this._coerceResponseText(rawResponse);

    const topLevel = this._tryParseJSON(rawText);
    const topLevelToolCall = this._normalizeToolCall(topLevel);
    if (topLevelToolCall) {
      return { assistantMessage: '', toolCall: topLevelToolCall, rawText };
    }

    const fencedBlocks = this._extractJSONCodeBlocks(rawText);
    for (const candidate of fencedBlocks) {
      const candidateJSON = this._tryParseJSON(candidate);
      const toolCall = this._normalizeToolCall(candidateJSON);
      if (toolCall) {
        return { assistantMessage: '', toolCall, rawText };
      }
    }

    const inlineObjects = this._extractJSONObjectCandidates(rawText);
    for (let i = inlineObjects.length - 1; i >= 0; i--) {
      const candidateJSON = this._tryParseJSON(inlineObjects[i]);
      const toolCall = this._normalizeToolCall(candidateJSON);
      if (toolCall) {
        return { assistantMessage: '', toolCall, rawText };
      }
    }

    return {
      assistantMessage: rawText,
      toolCall: null,
      rawText,
    };
  }

  /**
   * @private
   * @param {unknown} rawResponse
   * @returns {string}
   */
  _coerceResponseText(rawResponse) {
    if (typeof rawResponse === 'string') {
      return rawResponse.trim();
    }

    if (rawResponse && typeof rawResponse === 'object') {
      try {
        return JSON.stringify(rawResponse);
      } catch {
        return String(rawResponse);
      }
    }

    return String(rawResponse ?? '').trim();
  }

  /**
   * @private
   * @param {string} text
   * @returns {any|null}
   */
  _tryParseJSON(text) {
    if (typeof text !== 'string') return null;
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
      return null;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  /**
   * @private
   * @param {string} text
   * @returns {string[]}
   */
  _extractJSONCodeBlocks(text) {
    if (typeof text !== 'string' || text.length === 0) {
      return [];
    }

    const matches = [];
    const regex = /```(?:json)?\s*([\s\S]*?)```/gi;
    let match = regex.exec(text);
    while (match) {
      if (match[1]) {
        matches.push(match[1].trim());
      }
      match = regex.exec(text);
    }
    return matches;
  }

  /**
   * Extract top-level JSON object candidates embedded within free-form text.
   * This parser is string-aware so braces inside JSON strings are ignored.
   * @private
   * @param {string} text
   * @returns {string[]}
   */
  _extractJSONObjectCandidates(text) {
    if (typeof text !== 'string' || text.length === 0) {
      return [];
    }

    const results = [];
    let depth = 0;
    let startIndex = -1;
    let inString = false;
    let isEscaped = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
          continue;
        }
        if (char === '\\') {
          isEscaped = true;
          continue;
        }
        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{') {
        if (depth === 0) {
          startIndex = i;
        }
        depth += 1;
        continue;
      }

      if (char === '}' && depth > 0) {
        depth -= 1;
        if (depth === 0 && startIndex !== -1) {
          results.push(text.slice(startIndex, i + 1).trim());
          startIndex = -1;
        }
      }
    }

    return results;
  }

  /**
   * @private
   * @param {any} payload
   * @returns {{name: string, arguments: Record<string, any>}|null}
   */
  _normalizeToolCall(payload) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    let name = null;
    let args = {};

    if (payload.tool_call && typeof payload.tool_call === 'object') {
      name = payload.tool_call.name;
      args = payload.tool_call.arguments;
    } else if (typeof payload.name === 'string') {
      name = payload.name;
      args = payload.arguments;
    }

    if (typeof name !== 'string' || name.trim().length === 0) {
      return null;
    }

    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      args = {};
    }

    return {
      name: name.trim(),
      arguments: args,
    };
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
    this.cache = new Cache({ key: 'yt_video_data_cache_v1', storage: 'session', maxEntries: 6 });
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

    const cached = this.cache.get(videoId);
    if (cached) {
      return cached;
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

    const result = { description, transcriptionAsText };
    this.cache.set(videoId, result);
    return result;
  }
}
