// Simple auth helpers for the sidepanel

import { JWT_TOKEN_KEY } from './constants.js';

/**
 * Check if the user is logged in; if not, redirect to the login page.
 * Being "logged in" is represented by having a non-empty token in chrome.storage.local.sidekickToken.
 */
export function ensureAuthenticated() {
  try {
    chrome.storage.local.get([JWT_TOKEN_KEY], (result) => {
      const token = result[JWT_TOKEN_KEY];
      const hasToken = typeof token === 'string' && token.length > 0;
      if (!hasToken) {
        // Redirect to the login page that lives alongside sidepanel.html
        window.location.href = './login.html';
      }
    });
  } catch (error) {
    console.error('Error checking auth state:', error);
    // If storage access fails, fall back to showing login
    window.location.href = './login.html';
  }
}


