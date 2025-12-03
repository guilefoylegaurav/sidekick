// UI-layer classes for the sidepanel

import { formatMessageWithCode } from './markdown.js';

/**
 * Manages rendering of messages, empty state, quick actions visibility,
 * loading indicator, and scrolling.
 */
export class ChatView {
  /**
   * @param {{messagesContainer: HTMLElement, quickActionsContainer: HTMLElement|null, userInput: HTMLTextAreaElement, sendButton: HTMLButtonElement, clearButton: HTMLButtonElement}} deps
   */
  constructor({ messagesContainer, quickActionsContainer, userInput, sendButton, clearButton }) {
    this.messagesContainer = messagesContainer;
    this.quickActionsContainer = quickActionsContainer;
    this.userInput = userInput;
    this.sendButton = sendButton;
    this.clearButton = clearButton;
  }

  /**
   * Clears all messages from the view.
   */
  clearMessages() {
    if (this.messagesContainer) {
      this.messagesContainer.innerHTML = '';
    }
  }

  /**
   * Shows the empty state with a given CTA message.
   * @param {string} ctaText
   */
  showEmptyState(ctaText) {
    if (!this.messagesContainer) {
      return;
    }

    const emptyElement = document.createElement('div');
    emptyElement.classList.add('empty-state');
    emptyElement.innerHTML = `
      <div class="empty-content">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <p class="empty-message">${ctaText}</p>
        <p class="empty-subtitle">Ask me anything about this page</p>
      </div>
    `;

    this.messagesContainer.appendChild(emptyElement);
    this.showQuickActions();
  }

  /**
   * Removes the empty state element if present.
   */
  clearEmptyState() {
    if (!this.messagesContainer) {
      return;
    }
    const emptyState = this.messagesContainer.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }
  }

  /**
   * Hides quick actions panel.
   */
  hideQuickActions() {
    if (this.quickActionsContainer) {
      this.quickActionsContainer.classList.add('hidden');
    }
  }

  /**
   * Shows quick actions panel.
   */
  showQuickActions() {
    if (this.quickActionsContainer) {
      this.quickActionsContainer.classList.remove('hidden');
    }
  }

  /**
   * Scrolls to the last message in the container.
   */
  scrollToBottom() {
    if (!this.messagesContainer) {
      return;
    }
    const lastElement = this.messagesContainer.lastElementChild;
    if (lastElement) {
      lastElement.scrollIntoView({ block: 'end' });
    }
  }

  /**
   * Renders a new message bubble.
   * @param {string} message
   * @param {'user'|'llm'} sender
   */
  displayMessage(message, sender) {
    if (!this.messagesContainer) {
      return;
    }

    const messageElement = document.createElement('div');
    messageElement.classList.add('message', sender);

    // Format markdown and attach copy button listeners
    formatMessageWithCode(message, messageElement);

    this.messagesContainer.appendChild(messageElement);
    this.scrollToBottom();
  }

  /**
   * Enables/disables the main buttons with consistent styling.
   * @param {boolean} isDisabled
   */
  setButtonsDisabled(isDisabled) {
    [this.sendButton, this.clearButton].forEach((button) => {
      if (!button) return;
      button.disabled = isDisabled;
      button.classList.toggle('disabled', isDisabled);
    });
  }

  /**
   * Shows a loading indicator and disables buttons.
   */
  showLoading() {
    if (!this.messagesContainer) {
      return;
    }
    this.setButtonsDisabled(true);

    const existing = document.getElementById('loading-indicator');
    if (existing) {
      existing.remove();
    }

    const loadingElement = document.createElement('div');
    loadingElement.classList.add('loading');
    loadingElement.innerHTML = '<div class="horizontal-loader"></div>';
    loadingElement.id = 'loading-indicator';
    this.messagesContainer.appendChild(loadingElement);
    this.scrollToBottom();
  }

  /**
   * Hides loading indicator and re-enables buttons.
   */
  hideLoading() {
    const loadingElement = document.getElementById('loading-indicator');
    if (loadingElement) {
      loadingElement.remove();
    }
    this.setButtonsDisabled(false);
  }
}

/**
 * Handles user input behaviors: send, clear, and textarea resizing.
 */
export class InputController {
  /**
   * @param {{userInput: HTMLTextAreaElement, sendButton: HTMLButtonElement, clearButton: HTMLButtonElement, onSend: () => void, onClear: (force?: boolean) => void, maxTextareaHeight?: number}} deps
   */
  constructor({ userInput, sendButton, clearButton, onSend, onClear, maxTextareaHeight = 120 }) {
    this.userInput = userInput;
    this.sendButton = sendButton;
    this.clearButton = clearButton;
    this.onSend = onSend;
    this.onClear = onClear;
    this.maxTextareaHeight = maxTextareaHeight;

    this._bindEvents();
  }

  _bindEvents() {
    if (this.sendButton) {
      this.sendButton.addEventListener('click', () => {
        if (typeof this.onSend === 'function') {
          this.onSend();
        }
      });
    }

    if (this.clearButton) {
      this.clearButton.addEventListener('click', () => {
        if (typeof this.onClear === 'function') {
          this.onClear(false);
        }
      });
    }

    if (this.userInput) {
      this.userInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          if (typeof this.onSend === 'function') {
            this.onSend();
          }
        }
      });

      this.userInput.addEventListener('input', () => this.resizeTextarea());
    }
  }

  /**
   * Auto-resize textarea as user types.
   */
  resizeTextarea() {
    if (!this.userInput) return;
    this.userInput.style.height = 'auto';
    this.userInput.style.height = Math.min(this.userInput.scrollHeight, this.maxTextareaHeight) + 'px';
  }

  /**
   * Reset textarea height after clearing content.
   */
  resetTextareaHeight() {
    this.resizeTextarea();
  }
}

/**
 * Handles quick action buttons that prefill the input and trigger send.
 */
export class QuickActionsController {
  /**
   * @param {{container: HTMLElement|null, userInput: HTMLTextAreaElement, onSend: () => void}} deps
   */
  constructor({ container, userInput, onSend }) {
    this.container = container;
    this.userInput = userInput;
    this.onSend = onSend;

    this._bindEvents();
  }

  _bindEvents() {
    if (!this.container || !this.userInput) {
      return;
    }

    const quickActionButtons = this.container.querySelectorAll('.quick-action-btn');
    quickActionButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const prompt = button.getAttribute('data-prompt');
        if (prompt) {
          this.userInput.value = prompt;
          if (typeof this.onSend === 'function') {
            this.onSend();
          }
        }
      });
    });
  }
}


