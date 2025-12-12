// Simple server-side login handling using the backend API

import { API_LOGIN_ENDPOINT, JWT_TOKEN_KEY } from './modules/constants.js';

const form = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const errorEl = document.getElementById('login-error');
const successEl = document.getElementById('login-success');
const submitButton = document.getElementById('login-submit');

/**
 * Show an error message in the login form.
 * @param {string} message
 */
function showError(message) {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
  if (successEl) {
    successEl.classList.add('hidden');
  }
}

/**
 * Show a success message in the login form.
 * @param {string} message
 */
function showSuccess(message) {
  if (!successEl) return;
  successEl.textContent = message;
  successEl.classList.remove('hidden');
  if (errorEl) {
    errorEl.classList.add('hidden');
  }
}

function setSubmitting(isSubmitting) {
  if (!submitButton) return;
  submitButton.disabled = isSubmitting;
  submitButton.classList.toggle('disabled', isSubmitting);

  if (isSubmitting) {
    form.classList.add('is-loading');
  } else {
    form.classList.remove('is-loading');
  }

}

async function performLogin(email, password) {
  const response = await fetch(API_LOGIN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  let data;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }

  if (!response.ok) {
    const message = (data && data.message) || 'Login failed. Please try again.';
    throw new Error(message);
  }

  if (!data || !data.token) {
    throw new Error('Login response did not include a token.');
  }

  return data;
}

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!emailInput || !passwordInput) {
      showError('Missing required fields.');
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError('Please fill in all fields.');
      return;
    }

    setSubmitting(true);
    // Clear any previous error
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    }

    try {
      const data = await performLogin(email, password);

      const token = data.token;
      const user = data.user || { email };

      // Persist auth state in extension storage.
      chrome.storage.local.set(
        {
          sidekickToken: token
        },
        () => {

          // Redirect to the main sidepanel after a short delay
          setTimeout(() => {
            window.location.href = './sidepanel.html';
          }, 3000);
        }
      );
    } catch (error) {
      console.error('Error logging user in:', error);
      setSubmitting(false);
      showError(error.message || 'Something went wrong while logging you in.');
    }
  });
}


