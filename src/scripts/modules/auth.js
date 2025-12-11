// Simple auth helpers for the sidepanel

/**
 * Check if the user is logged in; if not, redirect to the login page.
 * Being "logged in" is represented by chrome.storage.local.sidekickLoggedIn === true.
 */
export function ensureAuthenticated() {
  try {
    chrome.storage.local.get(['sidekickLoggedIn'], (result) => {
      const isLoggedIn = Boolean(result.sidekickLoggedIn);

      if (!isLoggedIn) {
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


