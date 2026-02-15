# Koan

Koan is a Chrome Side Panel extension that lets you **chat with an AI about the page you’re currently viewing** (and YouTube videos), with optional “context tabs” so the AI can reference multiple open tabs at once.

## What the extension does

- **Side panel copilot**: Click the extension icon to open Koan in the browser side panel and ask questions about the current page.
- **Context selection (tabs)**: Use the context button to choose which tabs Koan should use as “context” for answering.
- **Agentic browser actions**: Koan can run tool calls to inspect and interact with pages (capture page snapshot, fill inputs, click elements) when a task requires it.
- **Agent mode UI state**: During tool execution, Koan switches into an “agent mode” visual state so it’s clear browser actions are in progress.
- **Page content extraction**:
  - For most sites, Koan reads page text
  - For **YouTube URLs**, Koan fetches the video's transcript to use as context

## Screenshots


![Koan screenshot 1](https://drive.google.com/uc?export=view&id=10nLwBiMxmjWaX0zUoydNb06-puBFU453)

![Koan screenshot 2](https://drive.google.com/uc?export=view&id=1bYWaU8wWPHDi8HzZkeA5WzxRCta0SPZi)

![Koan screenshot 3](https://drive.google.com/uc?export=view&id=1uGb7pVhEdtsbny0bZXI_XtkVsxVkKg3m)

![Koan screenshot 4 - agent mode](https://drive.google.com/uc?export=view&id=1CELwg-DjHAM3mVqMJiQu5InbL3G9d_Kf)



## Local installation

### 1) Clone the repo

```bash
git clone https://github.com/guilefoylegaurav/sidekick
cd sidekick
```

### 2) Load the extension into Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select the repo folder: `sidekick/`

### 3) Open Koan

- Click the Koan extension icon in the toolbar to open the side panel.
- If you aren’t authenticated, you’ll be redirected to the login page.


## Permissions (why Koan requests them)

Defined in `manifest.json`:

- **sidePanel**: to render the UI in Chrome’s side panel
- **storage**: to store JWT + chat state
- **tabs / activeTab**: to read tab metadata for context selection
- **scripting**: to inject / ping the content script when needed
- **other_host_permissions (`http(s)://*/*`)**: to allow content scripts on arbitrary pages

## License

This project is licensed under the **MIT License**. See `LICENSE`.

