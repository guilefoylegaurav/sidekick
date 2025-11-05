const messagesDiv = document.getElementById('messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');

let pageContent = "";

// Request page content when the side panel loads
window.addEventListener('load', () => {
  chrome.runtime.sendMessage({ action: "requestPageContent" }, (response) => {
    if (response && response.content) {
      pageContent = response.content;
      console.log("Page content loaded:", pageContent.substring(0, 100) + "..."); // Log first 100 chars
    } else {
      console.log("Could not retrieve page content.");
    }
  });
});

sendButton.addEventListener('click', sendMessage);
userInput.addEventListener('keypress', (event) => {
  if (event.key === 'Enter') {
    sendMessage();
  }
});

function sendMessage() {
  const message = userInput.value.trim();
  if (message) {
    displayMessage(message, 'user');
    userInput.value = '';
    getLLMResponse(message);
  }
}

async function getLLMResponse(userMessage) {
  // Show loading animation
  showLoading();
  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API delay
  
  // In a real scenario, you would send pageContent and userMessage to your LLM API
  const llmResponse = `You said: "${userMessage}".\n\nPage context (first 100 chars): ${pageContent.substring(0, 100)}...\n\nI am an AI, and I'm still learning!`;
  
  hideLoading();
  displayMessage(llmResponse, 'llm');
}

function displayMessage(message, sender) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message', sender);
  messageElement.textContent = message;
  messagesDiv.appendChild(messageElement);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function showLoading() {
  const loadingElement = document.createElement('div');
  loadingElement.classList.add('loading');
  loadingElement.innerHTML = '<div class="horizontal-loader"></div>';
  loadingElement.id = 'loading-indicator';
  messagesDiv.appendChild(loadingElement);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function hideLoading() {
  const loadingElement = document.getElementById('loading-indicator');
  if (loadingElement) {
    loadingElement.remove();
  }
}
