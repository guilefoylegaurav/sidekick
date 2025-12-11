// Simple client-side login handling using chrome.storage.local

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
}

if (form) {
  form.addEventListener('submit', (event) => {
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

    try {
      // placeholder
    } catch (error) {
      console.error('Error reading user from storage:', error);
      setSubmitting(false);
      showError('Something went wrong while logging you in.');
    }
  });
}


