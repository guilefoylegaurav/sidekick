// API communication module for LLM requests

import { API_ENDPOINT, SYSTEM_PROMPT } from './constants.js';

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
   * @param {string} userMessage
   * @param {string} pageContent
   * @param {Array<{content: string, sender: string}>} messages
   * @returns {Promise<string>}
   */
  async getResponse(userMessage, pageContent, messages) {
    const prompt = this.buildPrompt(pageContent, messages, userMessage);

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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

