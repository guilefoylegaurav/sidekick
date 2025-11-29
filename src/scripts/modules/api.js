// API communication module for LLM requests

import { API_ENDPOINT, SYSTEM_PROMPT } from './constants.js';

/**
 * Builds a prompt from page content, conversation history, and user message
 * @param {string} pageContent - The content of the current page
 * @param {Array} messages - Array of previous messages {content, sender}
 * @param {string} userMessage - The current user message
 * @returns {string} The formatted prompt
 */
function buildPrompt(pageContent, messages, userMessage) {
  const promptParts = [SYSTEM_PROMPT];
  
  // Add page context if available
  if (pageContent) {
    promptParts.push(`\n\nPage Context:\n${pageContent}\n`);
  }
  
  // Add conversation history
  if (messages.length > 0) {
    promptParts.push('Conversation History:');
    messages.forEach(msg => {
      const role = msg.sender === 'user' ? 'User' : 'Assistant';
      promptParts.push(`${role}: ${msg.content}`);
    });
  }
  
  // Add the current user message
  promptParts.push(`User: ${userMessage}`);
  
  return promptParts.join('\n');
}

/**
 * Fetches LLM response from the API
 * @param {string} userMessage - The user's message
 * @param {string} pageContent - The content of the current page
 * @param {Array} messages - Array of previous messages
 * @returns {Promise<string>} The LLM response text
 * @throws {Error} If the API request fails
 */
export async function getLLMResponse(userMessage, pageContent, messages) {
  const prompt = buildPrompt(pageContent, messages, userMessage);
  
  const response = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: prompt
    })
  });
  
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.response || data.message || JSON.stringify(data);
}

