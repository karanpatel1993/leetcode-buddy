document.addEventListener("DOMContentLoaded", () => {
  const messageInput = document.getElementById("message-input");
  const sendButton = document.getElementById("send-button");
  const chatContainer = document.getElementById("chat-container");
  const spinner = document.getElementById("spinner");
  const sendIcon = document.getElementById("send-icon");
  const statusElement = document.getElementById("status");
  const statusTextElement = document.getElementById("status-text");
  const apiKeyContainer = document.getElementById("api-key-setup");
  const chatInterface = document.getElementById("chat-interface");
  const saveApiKeyButton = document.getElementById("save-api-key");
  const apiKeyInput = document.getElementById("api-key-input");
  const problemTitleElement = document.getElementById("problem-title");
  const problemDifficultyElement =
    document.getElementById("problem-difficulty");

  let problemContext = null;
  let userCode = null;
  let retryCount = 0;
  const MAX_RETRIES = 3;

  // Track current problem
  let currentProblemTitle = null;
  let lastProblemTitle = null;

  // Keep track of current response element and streaming state
  let currentResponseElement = null;
  let waitingForResponse = false;
  let typingInterval = null;
  let typingCursor = null;

  // Store chat history
  let chatHistory = [];

  // Check if API key is set
  chrome.storage.local.get(
    ["geminiApiKey", "chatHistory", "lastProblemTitle"],
    (result) => {
      if (result.geminiApiKey) {
        apiKeyContainer.style.display = "none";
        chatInterface.style.display = "flex";

        // Store last problem title if it exists
        if (result.lastProblemTitle) {
          lastProblemTitle = result.lastProblemTitle;
        }

        // Load chat history if available
        if (result.chatHistory && Array.isArray(result.chatHistory)) {
          chatHistory = result.chatHistory;

          // Render chat history in the UI
          renderChatHistory();

          // Update clear chat button visibility
          setTimeout(() => updateClearChatButtonVisibility(), 100);
        }

        checkIfOnLeetCode();
      } else {
        apiKeyContainer.style.display = "block";
        chatInterface.style.display = "none";
      }
    }
  );

  // Render stored chat history
  function renderChatHistory() {
    chatHistory.forEach((message) => {
      if (message.role === "user") {
        addMessage(message.content, true);
      } else if (message.role === "assistant") {
        const messageElement = addMessage("", false);
        messageElement.innerHTML = formatResponse(message.content);
      }
    });

    // Scroll to the latest message
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // Format response to properly display markdown and code blocks
  function formatResponse(text) {
    if (!text) return "";

    // First extract code blocks to preserve them
    const codeBlockRegex = /```(?:[\w]*\n)?([\s\S]*?)```/g;
    let formattedText = text.replace(codeBlockRegex, (match, codeContent) => {
      // Extract language and code content
      const langMatch = match.match(/```(\w*)\n?([\s\S]*?)```/);
      if (!langMatch) return match;

      const language = langMatch[1];
      const code = langMatch[2];

      // Create HTML for code block
      return `<div style="position: relative; margin: 10px 0; background-color: #f8fafb; border-radius: 8px; border: 1px solid rgba(0, 0, 0, 0.1); overflow: hidden;">
        ${
          language
            ? `<div style="position: absolute; top: 0; right: 0; font-size: 11px; padding: 3px 8px; color: #888; background-color: rgba(0, 0, 0, 0.05); border-bottom-left-radius: 6px;">${language}</div>`
            : ""
        }
        <pre class="code-block">${code}</pre>
      </div>`;
    });

    // Format inline code
    formattedText = formattedText.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Convert line breaks to HTML
    formattedText = formattedText.replace(/\n\n/g, "<br><br>");
    formattedText = formattedText.replace(/\n/g, "<br>");

    return formattedText;
  }

  // Save API key
  saveApiKeyButton.addEventListener("click", () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      const isUpdate = saveApiKeyButton.textContent === "Update Key";
      saveApiKeyButton.textContent = isUpdate ? "Updating..." : "Saving...";
      saveApiKeyButton.disabled = true;

      chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
        if (isUpdate) {
          // If updating, just go back to chat
          hideApiKeyForm();
          // Show confirmation toast
          showToast("API key updated successfully!");
        } else {
          // Initial setup, transition to chat interface
          // Add animation for smooth transition
          apiKeyContainer.style.opacity = "0";
          apiKeyContainer.style.transform = "scale(0.95)";
          apiKeyContainer.style.transition = "all 0.3s ease";

          setTimeout(() => {
            apiKeyContainer.style.display = "none";
            chatInterface.style.display = "flex";
            chatInterface.style.opacity = "0";

            setTimeout(() => {
              chatInterface.style.opacity = "1";
              chatInterface.style.transition = "opacity 0.3s ease";
              checkIfOnLeetCode();
            }, 50);
          }, 300);
        }
      });
    } else {
      // Animate the input to indicate error
      apiKeyInput.style.borderColor = "#ff5252";
      apiKeyInput.style.backgroundColor = "rgba(255, 82, 82, 0.05)";
      setTimeout(() => {
        apiKeyInput.style.borderColor = "";
        apiKeyInput.style.backgroundColor = "";
      }, 800);
    }
  });

  // Function to show toast notification
  function showToast(message) {
    const toast = document.createElement("div");
    toast.textContent = message;
    toast.style.position = "fixed";
    toast.style.bottom = "20px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.backgroundColor = "#4CAF50";
    toast.style.color = "white";
    toast.style.padding = "10px 20px";
    toast.style.borderRadius = "4px";
    toast.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
    toast.style.zIndex = "1000";
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease";

    document.body.appendChild(toast);

    // Fade in
    setTimeout(() => {
      toast.style.opacity = "1";
    }, 10);

    // Fade out and remove after 3 seconds
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  // Check if we're on a LeetCode problem page
  function checkIfOnLeetCode() {
    updateStatus("Checking page...", "loading");

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0].url;
      if (url.includes("leetcode.com/problems/")) {
        updateStatus("Connected to LeetCode", "connected");

        // Get problem context from the page
        getProblemContext(tabs[0].id);
      } else {
        updateStatus("Not on LeetCode", "error");
        problemTitleElement.textContent =
          "Please navigate to a LeetCode problem";
        problemDifficultyElement.textContent = "";
        problemDifficultyElement.style.display = "none";
      }
    });
  }

  // Update status with visual indicator
  function updateStatus(text, type = "default") {
    statusTextElement.textContent = text;
    statusElement.className = "status"; // Reset classes

    if (type === "connected") {
      statusElement.classList.add("connected");
      statusElement.querySelector(".status-icon").style.color = "#4CAF50";
    } else if (type === "error") {
      statusElement.classList.add("error");
      statusElement.querySelector(".status-icon").style.color = "#ff5252";
    } else if (type === "loading") {
      statusTextElement.classList.add("loading-dots");
      statusElement.querySelector(".status-icon").style.color = "#FFC107";
    } else {
      statusElement.querySelector(".status-icon").style.color = "#e0e0e0";
      statusTextElement.classList.remove("loading-dots");
    }

    // No need for positioning styles as it's now handled by CSS
  }

  function getProblemContext(tabId) {
    retryCount = 0;
    updateStatus("Extracting data...", "loading");

    // Inject content script programmatically
    injectContentScript(tabId);
  }

  function injectContentScript(tabId) {
    chrome.scripting.executeScript(
      {
        target: { tabId: tabId },
        files: ["content.js"],
      },
      (results) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Script injection error:",
            chrome.runtime.lastError.message
          );
          handleProblemContextError(
            "Failed to inject content script: " +
              chrome.runtime.lastError.message
          );
          return;
        }

        console.log("Content script injected successfully");
        tryGetProblemContext(tabId);
      }
    );
  }

  function tryGetProblemContext(tabId) {
    // Add a small delay to ensure the content script is fully initialized
    setTimeout(() => {
      chrome.tabs.sendMessage(
        tabId,
        { action: "getProblemContext" },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error("Message error:", chrome.runtime.lastError.message);
            handleProblemContextError(
              "Content script not ready: " + chrome.runtime.lastError.message
            );
            return;
          }

          if (response && response.success) {
            problemContext = response.problemContext;
            userCode = response.userCode;
            updateProblemInfo(response);
            updateStatus("Ready", "connected");

            // Clear the initial message if we have problem data
            if (document.querySelector(".initial-message")) {
              // Fade out the initial message
              const initialMessage = document.querySelector(".initial-message");
              initialMessage.style.opacity = "0";
              initialMessage.style.transition = "opacity 0.5s ease";

              // Remove it after animation completes
              setTimeout(() => {
                if (initialMessage.parentNode) {
                  initialMessage.parentNode.removeChild(initialMessage);
                }
              }, 500);
            }
          } else {
            const errorMsg = response ? response.error : "Unknown error";
            handleProblemContextError(
              `Failed to get problem context: ${errorMsg}`
            );
          }
        }
      );
    }, 300); // Small delay to ensure script is ready
  }

  function handleProblemContextError(errorMsg) {
    console.error(errorMsg);

    if (retryCount < MAX_RETRIES) {
      retryCount++;
      updateStatus(`Retrying (${retryCount}/${MAX_RETRIES})...`, "loading");

      // Add a delay before retrying
      setTimeout(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (errorMsg.includes("Extension context invalidated")) {
            // If extension context was invalidated, we need to reinject
            injectContentScript(tabs[0].id);
          } else {
            tryGetProblemContext(tabs[0].id);
          }
        });
      }, 1000 * retryCount); // Increase delay with each retry
    } else {
      updateStatus("Failed to load data", "error");

      // Add retry button to UI
      const retryButton = document.createElement("button");
      retryButton.textContent = "Retry";
      retryButton.className = "retry-button";
      retryButton.style.padding = "4px 10px";
      retryButton.style.backgroundColor = "#2cbb5d";
      retryButton.style.color = "white";
      retryButton.style.border = "none";
      retryButton.style.borderRadius = "4px";
      retryButton.style.cursor = "pointer";

      retryButton.addEventListener("click", () => {
        // Remove the retry button from the toolbar
        const headerToolbar = document.querySelector(".header-toolbar");
        if (headerToolbar.contains(retryButton)) {
          headerToolbar.removeChild(retryButton);
        }
        updateStatus("Retrying...", "loading");

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          retryCount = 0;
          // When manually retrying, always re-inject the content script
          injectContentScript(tabs[0].id);
        });
      });

      // If a retry button already exists, don't add another one
      const headerToolbar = document.querySelector(".header-toolbar");
      const existingRetryButton = headerToolbar.querySelector(".retry-button");
      if (!existingRetryButton) {
        headerToolbar.appendChild(retryButton);
      }
    }
  }

  function updateProblemInfo(response) {
    if (response.title) {
      currentProblemTitle = response.title;
      problemTitleElement.textContent = response.title;

      // Check if problem has changed
      if (lastProblemTitle && lastProblemTitle !== currentProblemTitle) {
        // Problem has changed, show notification to clear chat
        showProblemChangeNotification();
      } else {
        // Update the stored problem title
        chrome.storage.local.set({ lastProblemTitle: currentProblemTitle });
      }
    }

    if (response.difficulty) {
      const diffText = response.difficulty.trim().toLowerCase();
      problemDifficultyElement.textContent =
        diffText.charAt(0).toUpperCase() + diffText.slice(1);

      // Reset classes
      problemDifficultyElement.className = "difficulty-tag";

      // Add appropriate class based on difficulty
      if (diffText.includes("easy")) {
        problemDifficultyElement.classList.add("easy");
      } else if (diffText.includes("medium")) {
        problemDifficultyElement.classList.add("medium");
      } else if (diffText.includes("hard")) {
        problemDifficultyElement.classList.add("hard");
      }

      problemDifficultyElement.style.display = "inline-block";
    } else {
      problemDifficultyElement.style.display = "none";
    }
  }

  // Function to show problem change notification with clear option
  function showProblemChangeNotification() {
    // Only show notification if there's chat history to clear
    if (!chatHistory || chatHistory.length === 0) {
      // Just update the lastProblemTitle without showing notification
      chrome.storage.local.set({ lastProblemTitle: currentProblemTitle });
      return;
    }

    // Create notification container
    const notificationContainer = document.createElement("div");
    notificationContainer.className = "problem-change-notification";
    notificationContainer.style.backgroundColor = "#f9f2d6";
    notificationContainer.style.borderRadius = "8px";
    notificationContainer.style.padding = "12px";
    notificationContainer.style.margin = "0 0 12px 0";
    notificationContainer.style.display = "flex";
    notificationContainer.style.alignItems = "center";
    notificationContainer.style.justifyContent = "space-between";
    notificationContainer.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
    notificationContainer.style.animation = "fadeIn 0.3s ease-in-out";

    // Add notification text
    const notificationText = document.createElement("div");
    notificationText.textContent = "New problem detected. Clear chat history?";
    notificationText.style.fontSize = "13px";
    notificationText.style.color = "#5f5021";
    notificationText.style.flexGrow = "1";

    // Button container
    const buttonContainer = document.createElement("div");
    buttonContainer.style.display = "flex";
    buttonContainer.style.alignItems = "center";
    buttonContainer.style.gap = "8px"; // Use gap for consistent spacing
    buttonContainer.style.marginLeft = "16px"; // Space between text and buttons

    // Add clear button
    const clearButton = document.createElement("button");
    clearButton.textContent = "Clear";
    clearButton.style.backgroundColor = "#4CAF50";
    clearButton.style.color = "white";
    clearButton.style.border = "none";
    clearButton.style.borderRadius = "4px";
    clearButton.style.padding = "6px 12px";
    clearButton.style.cursor = "pointer";
    clearButton.style.fontSize = "12px";
    clearButton.style.minWidth = "60px"; // Ensure consistent width
    clearButton.style.fontWeight = "500";

    // Add dismiss button
    const dismissButton = document.createElement("button");
    dismissButton.textContent = "Keep";
    dismissButton.style.backgroundColor = "#9e9e9e";
    dismissButton.style.color = "white";
    dismissButton.style.border = "none";
    dismissButton.style.borderRadius = "4px";
    dismissButton.style.padding = "6px 12px";
    dismissButton.style.cursor = "pointer";
    dismissButton.style.fontSize = "12px";
    dismissButton.style.minWidth = "60px"; // Ensure consistent width
    dismissButton.style.fontWeight = "500";

    // Add event listener for clear button
    clearButton.addEventListener("click", () => {
      clearChatHistory();
      chatContainer.removeChild(notificationContainer);
    });

    // Add event listener for dismiss button
    dismissButton.addEventListener("click", () => {
      chatContainer.removeChild(notificationContainer);
      // Update lastProblemTitle to current problem
      chrome.storage.local.set({ lastProblemTitle: currentProblemTitle });
    });

    // Add hover effect for buttons
    const addHoverEffect = (button) => {
      button.style.transition = "background-color 0.2s ease";
      button.addEventListener("mouseover", () => {
        button.style.backgroundColor =
          button === clearButton ? "#45a049" : "#8e8e8e";
      });
      button.addEventListener("mouseout", () => {
        button.style.backgroundColor =
          button === clearButton ? "#4CAF50" : "#9e9e9e";
      });
    };

    addHoverEffect(clearButton);
    addHoverEffect(dismissButton);

    // Assemble the notification
    buttonContainer.appendChild(clearButton);
    buttonContainer.appendChild(dismissButton);
    notificationContainer.appendChild(notificationText);
    notificationContainer.appendChild(buttonContainer);

    // Add to the top of chat container
    if (chatContainer.firstChild) {
      chatContainer.insertBefore(
        notificationContainer,
        chatContainer.firstChild
      );
    } else {
      chatContainer.appendChild(notificationContainer);
    }

    // Add animation style
    const style = document.createElement("style");
    style.textContent = `
      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  // Clear chat history function
  function clearChatHistory() {
    // Check if chat history is already empty
    if (!chatHistory || chatHistory.length === 0) {
      return; // Don't show confirmation if already empty
    }

    // Clear chat history
    chatHistory = [];
    chrome.storage.local.set({
      chatHistory: [],
      lastProblemTitle: currentProblemTitle,
    });

    // Clear chat UI
    chatContainer.innerHTML = "";

    // Add confirmation message
    const confirmationElement = document.createElement("div");
    confirmationElement.textContent = "Chat history cleared";
    confirmationElement.style.textAlign = "center";
    confirmationElement.style.padding = "10px";
    confirmationElement.style.color = "#888";
    confirmationElement.style.fontSize = "12px";
    confirmationElement.style.opacity = "0";
    confirmationElement.style.transition = "opacity 0.3s ease";

    chatContainer.appendChild(confirmationElement);

    // Fade in the confirmation message
    setTimeout(() => {
      confirmationElement.style.opacity = "1";
    }, 10);

    // Fade out and remove after 3 seconds
    setTimeout(() => {
      confirmationElement.style.opacity = "0";
      setTimeout(() => {
        if (confirmationElement.parentNode) {
          confirmationElement.parentNode.removeChild(confirmationElement);
        }
      }, 300);
    }, 3000);

    // Update button visibility
    updateClearChatButtonVisibility();
  }

  // Send message to Gemini
  async function sendMessageToGemini(message) {
    return new Promise((resolve, reject) => {
      if (waitingForResponse) {
        reject("Already waiting for a response. Please wait.");
        return;
      }

      waitingForResponse = true;

      chrome.storage.local.get(["geminiApiKey"], (result) => {
        if (!result.geminiApiKey) {
          waitingForResponse = false;
          reject("API key not found. Please set your Gemini API key.");
          return;
        }

        updateStatus("Getting response...", "loading");

        // Create streaming effect on UI before API response
        startTypingAnimation("Thinking...");

        // Add message to chat history before sending
        chatHistory.push({
          role: "user",
          content: message,
        });

        // Save chat history to storage
        chrome.storage.local.set({ chatHistory });

        // Update clear chat button visibility
        updateClearChatButtonVisibility();

        // Send request to background script
        chrome.runtime.sendMessage(
          {
            action: "sendToGemini",
            apiKey: result.geminiApiKey,
            message: message,
            problemContext: problemContext,
            userCode: userCode,
            chatHistory: chatHistory, // Send chat history to background
          },
          (response) => {
            if (chrome.runtime.lastError) {
              waitingForResponse = false;
              updateStatus("Error", "error");
              reject("Error: " + chrome.runtime.lastError.message);
              return;
            }

            // Initial response from background script
            if (response && response.success) {
              // Add response to chat history
              chatHistory.push({
                role: "assistant",
                content: response.data,
              });

              // Save updated chat history to storage
              chrome.storage.local.set({ chatHistory });

              // Start streaming the response
              streamResponse(response.data);
              resolve("Streaming response...");
            } else {
              waitingForResponse = false;
              updateStatus("Error", "error");
              reject(
                response ? response.error : "Failed to get response from Gemini"
              );
            }
          }
        );
      });
    });
  }

  // Simulate streaming response
  function streamResponse(fullResponse) {
    // Clear the "Thinking..." message
    if (currentResponseElement) {
      currentResponseElement.textContent = "";
    }

    // Split response into chunks (sentences, code blocks, etc.)
    const chunks = splitIntoChunks(fullResponse);
    let chunkIndex = 0;

    // Create typing cursor
    typingCursor = document.createElement("span");
    typingCursor.classList.add("typing-cursor");
    if (currentResponseElement) {
      currentResponseElement.appendChild(typingCursor);
    }

    // Stream chunks with realistic typing speed
    function streamNextChunk() {
      if (chunkIndex < chunks.length) {
        const chunk = chunks[chunkIndex];
        displayChunk(chunk);
        chunkIndex++;

        // Calculate delay based on chunk size and content
        let delay = calculateDelay(chunk);
        setTimeout(streamNextChunk, delay);
      } else {
        // Streaming complete
        finishStreaming();
      }
    }

    // Start streaming
    streamNextChunk();
  }

  // Split response into meaningful chunks for streaming
  function splitIntoChunks(text) {
    if (!text) return [];

    // First extract code blocks to preserve them
    const codeBlockRegex = /```(?:[\w]*\n)?([\s\S]*?)```/g;
    const codeBlocks = [];
    const withoutCode = text.replace(
      codeBlockRegex,
      (match, codeContent, index) => {
        codeBlocks.push({ type: "code", content: match, index });
        return `[CODE_BLOCK_${codeBlocks.length - 1}]`;
      }
    );

    // Split remaining text into sentences and paragraphs
    const parts = [];
    const paragraphs = withoutCode.split(/\n\n+/);

    paragraphs.forEach((paragraph) => {
      if (!paragraph.trim()) return;

      // Check if paragraph contains a code block placeholder
      if (paragraph.includes("[CODE_BLOCK_")) {
        const placeholderRegex = /\[CODE_BLOCK_(\d+)\]/;
        const match = paragraph.match(placeholderRegex);

        if (match) {
          const beforeCode = paragraph.substring(
            0,
            paragraph.indexOf(match[0])
          );
          if (beforeCode.trim()) {
            parts.push({ type: "text", content: beforeCode });
          }

          // Add the code block
          const codeIndex = parseInt(match[1], 10);
          parts.push(codeBlocks[codeIndex]);

          const afterCode = paragraph.substring(
            paragraph.indexOf(match[0]) + match[0].length
          );
          if (afterCode.trim()) {
            parts.push({ type: "text", content: afterCode });
          }
        }
      } else {
        // Regular paragraph, split into sentences for smoother typing
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        sentences.forEach((sentence) => {
          if (sentence.trim()) {
            parts.push({ type: "text", content: sentence + " " });
          }
        });

        // Add paragraph break
        parts.push({ type: "break", content: "\n\n" });
      }
    });

    return parts;
  }

  // Calculate appropriate delay based on chunk content
  function calculateDelay(chunk) {
    // Base delay
    let delay = 150;

    if (chunk.type === "code") {
      // Longer delay for code blocks to create visual break
      return 500;
    } else if (chunk.type === "break") {
      // Brief pause at paragraph breaks
      return 300;
    } else {
      // For text, calculate based on content length and complexity
      const content = chunk.content;

      // Shorter content = shorter delay
      if (content.length < 20) {
        delay = 100;
      } else if (content.length > 100) {
        delay = 200;
      }

      // Add slight randomization for natural feel
      return delay * (0.8 + Math.random() * 0.4);
    }
  }

  // Display chunk with proper formatting
  function displayChunk(chunk) {
    if (!currentResponseElement) return;

    if (chunk.type === "code") {
      // Handle code blocks
      displayCodeBlock(chunk.content);
    } else if (chunk.type === "break") {
      // Add paragraph break
      const br = document.createElement("br");
      currentResponseElement.insertBefore(br, typingCursor);
      const secondBr = document.createElement("br");
      currentResponseElement.insertBefore(secondBr, typingCursor);
    } else {
      // Handle regular text
      const content = chunk.content;

      // Check for inline code (text between backticks)
      const inlineCodeRegex = /`([^`]+)`/g;
      let lastIndex = 0;
      let match;

      // Process inline code
      while ((match = inlineCodeRegex.exec(content)) !== null) {
        // Add text before inline code
        const beforeCode = content.substring(lastIndex, match.index);
        if (beforeCode) {
          const textNode = document.createTextNode(beforeCode);
          currentResponseElement.insertBefore(textNode, typingCursor);
        }

        // Add inline code
        const code = document.createElement("code");
        code.textContent = match[1];
        currentResponseElement.insertBefore(code, typingCursor);

        lastIndex = match.index + match[0].length;
      }

      // Add any remaining text
      const remainingText = content.substring(lastIndex);
      if (remainingText) {
        const textNode = document.createTextNode(remainingText);
        currentResponseElement.insertBefore(textNode, typingCursor);
      }
    }

    // Scroll to keep response in view
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  // Display code block with syntax highlighting
  function displayCodeBlock(codeBlockText) {
    // Extract language and code content
    const match = codeBlockText.match(/```(\w*)\n?([\s\S]*?)```/);
    if (!match) return;

    const language = match[1];
    const code = match[2];

    // Create code block container
    const codeBlockContainer = document.createElement("div");
    codeBlockContainer.style.position = "relative";
    codeBlockContainer.style.margin = "10px 0";
    codeBlockContainer.style.backgroundColor = "#f8fafb";
    codeBlockContainer.style.borderRadius = "8px";
    codeBlockContainer.style.border = "1px solid rgba(0, 0, 0, 0.1)";
    codeBlockContainer.style.overflow = "hidden";

    // Add language tag if available
    if (language) {
      const langTag = document.createElement("div");
      langTag.style.position = "absolute";
      langTag.style.top = "0";
      langTag.style.right = "0";
      langTag.style.fontSize = "11px";
      langTag.style.padding = "3px 8px";
      langTag.style.color = "#888";
      langTag.style.backgroundColor = "rgba(0, 0, 0, 0.05)";
      langTag.style.borderBottomLeftRadius = "6px";
      langTag.textContent = language;
      codeBlockContainer.appendChild(langTag);
    }

    // Create code block
    const codeBlock = document.createElement("pre");
    codeBlock.className = "code-block";
    codeBlock.textContent = code;
    codeBlockContainer.appendChild(codeBlock);

    // Add copy button
    const copyButton = document.createElement("button");
    copyButton.style.position = "absolute";
    copyButton.style.top = "4px";
    copyButton.style.right = "4px";
    copyButton.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
    copyButton.style.border = "none";
    copyButton.style.borderRadius = "4px";
    copyButton.style.padding = "4px";
    copyButton.style.cursor = "pointer";
    copyButton.style.display = "flex";
    copyButton.style.opacity = "0";
    copyButton.style.transition = "opacity 0.2s ease";
    copyButton.innerHTML =
      '<span class="material-icons" style="font-size: 16px; color: #aaa;">content_copy</span>';

    // Show button on hover
    codeBlockContainer.addEventListener("mouseenter", () => {
      copyButton.style.opacity = "1";
    });

    codeBlockContainer.addEventListener("mouseleave", () => {
      copyButton.style.opacity = "0";
    });

    // Handle copy functionality
    copyButton.addEventListener("click", () => {
      navigator.clipboard.writeText(code).then(() => {
        copyButton.innerHTML =
          '<span class="material-icons" style="font-size: 16px; color: #4CAF50;">check</span>';
        setTimeout(() => {
          copyButton.innerHTML =
            '<span class="material-icons" style="font-size: 16px; color: #aaa;">content_copy</span>';
        }, 2000);
      });
    });

    codeBlockContainer.appendChild(copyButton);

    // Insert before typing cursor
    currentResponseElement.insertBefore(codeBlockContainer, typingCursor);
  }

  // Start animation for "Thinking..." message
  function startTypingAnimation(text) {
    if (typingInterval) {
      clearInterval(typingInterval);
      typingInterval = null;
    }

    currentResponseElement.textContent = text;
  }

  // Finish the streaming animation
  function finishStreaming() {
    // Remove typing cursor
    if (typingCursor && typingCursor.parentNode) {
      typingCursor.parentNode.removeChild(typingCursor);
    }

    // Clear typing interval if any
    if (typingInterval) {
      clearInterval(typingInterval);
      typingInterval = null;
    }

    waitingForResponse = false;
    updateStatus("Ready", "connected");

    // Re-enable input
    messageInput.disabled = false;
    sendButton.disabled = false;
    spinner.style.display = "none";
    sendIcon.style.display = "block";
    messageInput.focus();
  }

  // Add a message to the chat
  function addMessage(text, isUser) {
    const messageElement = document.createElement("div");
    messageElement.classList.add("message");
    messageElement.classList.add(isUser ? "user-message" : "bot-message");

    // Add avatar to bot messages for better visual identification
    if (!isUser) {
      const avatarContainer = document.createElement("div");
      avatarContainer.classList.add("message-avatar");

      const avatar = document.createElement("div");
      avatar.classList.add("bot-avatar");
      avatar.innerHTML = '<span class="material-icons">smart_toy</span>';

      avatarContainer.appendChild(avatar);
      messageElement.appendChild(avatarContainer);

      // Create content container
      const contentContainer = document.createElement("div");
      contentContainer.classList.add("message-content");
      messageElement.appendChild(contentContainer);

      // Return the content container for streaming into
      chatContainer.appendChild(messageElement);
      return contentContainer;
    } else {
      // User messages
      messageElement.textContent = text;

      // Add user avatar
      const userAvatar = document.createElement("div");
      userAvatar.classList.add("user-avatar");
      userAvatar.innerHTML = '<span class="material-icons">person</span>';
      messageElement.appendChild(userAvatar);

      chatContainer.appendChild(messageElement);

      // Delay the scroll to allow the animation to start
      setTimeout(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }, 100);

      // Update clear chat button visibility when messages are added
      updateClearChatButtonVisibility();

      return messageElement;
    }
  }

  // Handle message sending
  sendButton.addEventListener("click", async () => {
    const message = messageInput.value.trim();
    if (message) {
      // Add user message to chat
      addMessage(message, true);
      messageInput.value = "";
      messageInput.disabled = true;
      sendButton.disabled = true;
      spinner.style.display = "block";
      sendIcon.style.display = "none";

      // Focus the input field again for immediate typing after sending
      messageInput.focus();

      try {
        // Create a placeholder message for the response
        currentResponseElement = addMessage("", false);

        // This will handle the streaming effect
        await sendMessageToGemini(message);
      } catch (error) {
        waitingForResponse = false;
        updateStatus("Ready", "connected");

        if (currentResponseElement) {
          currentResponseElement.textContent = "Error: " + error;
          currentResponseElement.style.color = "#ff5252";
        } else {
          // Fallback if no response element exists
          const errorElement = addMessage("Error: " + error, false);
          errorElement.style.color = "#ff5252";
        }

        messageInput.disabled = false;
        sendButton.disabled = false;
        spinner.style.display = "none";
        sendIcon.style.display = "block";
      }
    }
  });

  // Handle Enter key
  messageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendButton.click();
    }
  });

  // Auto-resize textarea as user types
  messageInput.addEventListener("input", function () {
    // Reset height to auto to get the right scrollHeight
    this.style.height = "auto";

    // Set new height based on scrollHeight (with max-height handled by CSS)
    const newHeight = Math.min(this.scrollHeight, 120);
    this.style.height = newHeight + "px";
  });

  // Focus input field on load
  messageInput.focus();

  // Create a button container in the header for the API key button
  const headerApiKeyButton = document.createElement("button");
  headerApiKeyButton.textContent = "API Key";
  headerApiKeyButton.className = "header-button";
  headerApiKeyButton.title = "Update API Key";

  // Add key icon
  const keyIcon = document.createElement("span");
  keyIcon.className = "material-icons";
  keyIcon.style.fontSize = "14px";
  keyIcon.style.marginRight = "4px";
  keyIcon.textContent = "vpn_key";
  headerApiKeyButton.insertBefore(keyIcon, headerApiKeyButton.firstChild);

  // Add hover effect
  headerApiKeyButton.addEventListener("mouseover", () => {
    headerApiKeyButton.style.backgroundColor = "rgba(255, 255, 255, 0.3)";
  });
  headerApiKeyButton.addEventListener("mouseout", () => {
    headerApiKeyButton.style.backgroundColor = "rgba(255, 255, 255, 0.2)";
  });

  headerApiKeyButton.addEventListener("click", () => {
    showApiKeyForm();
  });

  // Add the button to the header toolbar instead of the header element
  const headerToolbar = document.querySelector(".header-toolbar");
  headerToolbar.appendChild(headerApiKeyButton);

  // Create a Clear Chat button in the input area (keep this one only)
  const clearChatButton = document.createElement("button");
  clearChatButton.id = "clear-chat-button";
  clearChatButton.className = "clear-chat-button";
  clearChatButton.title = "Clear current chat";
  clearChatButton.style.display = "none"; // Hidden by default
  clearChatButton.style.alignItems = "center";
  clearChatButton.style.justifyContent = "center";
  clearChatButton.style.borderRadius = "50%";
  clearChatButton.style.width = "36px";
  clearChatButton.style.height = "36px";
  clearChatButton.style.border = "none";
  clearChatButton.style.backgroundColor = "#f0f0f0";
  clearChatButton.style.cursor = "pointer";
  clearChatButton.style.transition = "background-color 0.2s ease";
  clearChatButton.style.marginRight = "8px";
  clearChatButton.style.flexShrink = "0";

  // Add hover effect
  clearChatButton.addEventListener("mouseover", () => {
    clearChatButton.style.backgroundColor = "#e0e0e0";
  });
  clearChatButton.addEventListener("mouseout", () => {
    clearChatButton.style.backgroundColor = "#f0f0f0";
  });

  // Add trash icon
  const trashIcon = document.createElement("span");
  trashIcon.className = "material-icons";
  trashIcon.style.fontSize = "20px";
  trashIcon.style.color = "#888";
  trashIcon.textContent = "delete";
  clearChatButton.appendChild(trashIcon);

  // Add click event listener
  clearChatButton.addEventListener("click", () => {
    clearChatHistory();
    updateClearChatButtonVisibility();
  });

  // Insert before the message input in the input container
  const inputContainer = document.querySelector(".input-container");
  inputContainer.insertBefore(clearChatButton, messageInput);

  // Call once to set initial state
  updateClearChatButtonVisibility();

  // Function to update Clear Chat button visibility
  function updateClearChatButtonVisibility() {
    const clearChatButton = document.getElementById("clear-chat-button");
    if (!clearChatButton) return;

    if (chatHistory && chatHistory.length > 0) {
      clearChatButton.style.display = "flex";
    } else {
      clearChatButton.style.display = "none";
    }
  }

  // Function to show API key form
  function showApiKeyForm() {
    // Get current API key
    chrome.storage.local.get(["geminiApiKey"], (result) => {
      if (result.geminiApiKey) {
        // Populate the input with current key
        apiKeyInput.value = result.geminiApiKey;
      }

      // Create a back button for the API key form
      if (!document.getElementById("back-to-chat")) {
        const backButton = document.createElement("button");
        backButton.id = "back-to-chat";
        backButton.textContent = "Back to Chat";
        backButton.style.marginTop = "16px";
        backButton.style.padding = "8px 16px";
        backButton.style.backgroundColor = "#9e9e9e";
        backButton.style.color = "white";
        backButton.style.border = "none";
        backButton.style.borderRadius = "4px";
        backButton.style.cursor = "pointer";
        backButton.style.fontSize = "14px";
        backButton.style.transition = "background-color 0.2s ease";

        backButton.addEventListener("mouseover", () => {
          backButton.style.backgroundColor = "#8e8e8e";
        });
        backButton.addEventListener("mouseout", () => {
          backButton.style.backgroundColor = "#9e9e9e";
        });

        backButton.addEventListener("click", () => {
          hideApiKeyForm();
        });

        // Add to API key container
        apiKeyContainer.appendChild(backButton);
      }

      // Update title to reflect update action
      const apiKeyTitle = apiKeyContainer.querySelector("h2");
      if (apiKeyTitle) {
        apiKeyTitle.textContent = "Update Your Gemini API Key";
      }

      // Update button text
      saveApiKeyButton.textContent = "Update Key";
      saveApiKeyButton.disabled = false;

      // Show API key container, hide chat interface
      chatInterface.style.display = "none";
      apiKeyContainer.style.display = "block";
      apiKeyContainer.style.opacity = "1";
      apiKeyContainer.style.transform = "scale(1)";

      // Focus the input
      apiKeyInput.focus();
    });
  }

  // Function to hide API key form and go back to chat
  function hideApiKeyForm() {
    apiKeyContainer.style.display = "none";
    chatInterface.style.display = "flex";

    // Reset form state
    if (saveApiKeyButton.textContent === "Update Key") {
      saveApiKeyButton.textContent = "Save";
    }
  }
});
