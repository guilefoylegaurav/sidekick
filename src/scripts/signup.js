// Simple client-side signup handling using chrome.storage.local

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

if (form) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const validationError = validateInputs();
    if (validationError) {
      showError(validationError);
      return;
    }

    const user = {
      email: emailInput.value.trim(),
      password: passwordInput.value,
    };

    setSubmitting(true);

    try {
      // placeholder
    } catch (error) {
      console.error('Error signing up user:', error);
      setSubmitting(false);
      showError('Something went wrong while creating your account.');
    }
  });
}


