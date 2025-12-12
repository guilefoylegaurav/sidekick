// Simple server-side signup handling using the backend API

import { API_SIGNUP_ENDPOINT } from './modules/constants.js';

const form = document.getElementById('signup-form');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');
const errorEl = document.getElementById('signup-error');
const successEl = document.getElementById('signup-success');
const submitButton = document.getElementById('signup-submit');

/**
 * Show an error message in the signup form.
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
 * Show a success message in the signup form.
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

function validateInputs() {
  if (!emailInput || !passwordInput || !confirmPasswordInput) {
    return 'Missing required fields.';
  }

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (!email || !password || !confirmPassword) {
    return 'Please fill in all fields.';
  }

  if (!email.includes('@')) {
    return 'Please enter a valid email.';
  }

  if (password.length < 6) {
    return 'Password must be at least 6 characters.';
  }

  if (password !== confirmPassword) {
    return 'Passwords do not match.';
  }

  return null;
}

async function performSignup(email, password) {
  const body = { email, password };

  const response = await fetch(API_SIGNUP_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  let data;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }

  if (!response.ok) {
    const message = (data && data.message) || 'Signup failed. Please try again.';
    throw new Error(message);
  }

  if (!data || !data.user) {
    throw new Error('Signup response did not include a user object.');
  }

  return data;
}

if (form) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const validationError = validateInputs();
    if (validationError) {
      showError(validationError);
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    setSubmitting(true);
    // Clear any previous error
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.add('hidden');
    }

    try {
      const data = await performSignup(email, password, name);

      // Show a quick success message, then redirect to login.
      showSuccess(data.message || 'Account created successfully. Redirecting to login…');
      setTimeout(() => {
        window.location.href = './login.html';
      }, 3000);
    } catch (error) {
      console.error('Error signing up user:', error);
      setSubmitting(false);
      showError(error.message || 'Something went wrong while creating your account.');
    }
  });
}


