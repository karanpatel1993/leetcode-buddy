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

  // Keep track of current response message element and streaming state
  let currentResponseElement = null;
  let waitingForResponse = false;
  let typingInterval = null;
  let typingCursor = null;

  // Check if API key is set
  chrome.storage.local.get(["geminiApiKey"], (result) => {
    if (result.geminiApiKey) {
      apiKeyContainer.style.display = "none";
      chatInterface.style.display = "flex";
      checkIfOnLeetCode();
    } else {
      apiKeyContainer.style.display = "block";
      chatInterface.style.display = "none";
    }
  });

  // Save API key
  saveApiKeyButton.addEventListener("click", () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      saveApiKeyButton.textContent = "Saving...";
      saveApiKeyButton.disabled = true;

      chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
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
      retryButton.style.marginLeft = "8px";
      retryButton.style.padding = "4px 10px";
      retryButton.style.backgroundColor = "#2cbb5d";
      retryButton.style.color = "white";
      retryButton.style.border = "none";
      retryButton.style.borderRadius = "4px";
      retryButton.style.cursor = "pointer";

      retryButton.addEventListener("click", () => {
        if (statusTextElement.nextElementSibling === retryButton) {
          statusElement.removeChild(retryButton);
        }
        updateStatus("Retrying...", "loading");

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          retryCount = 0;
          // When manually retrying, always re-inject the content script
          injectContentScript(tabs[0].id);
        });
      });

      // If a retry button already exists, don't add another one
      if (
        !statusTextElement.nextElementSibling ||
        !statusTextElement.nextElementSibling.classList.contains("retry-button")
      ) {
        statusElement.appendChild(retryButton);
      }
    }
  }

  function updateProblemInfo(response) {
    if (response.title) {
      problemTitleElement.textContent = response.title;
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

        // Send request to background script
        chrome.runtime.sendMessage(
          {
            action: "sendToGemini",
            apiKey: result.geminiApiKey,
            message: message,
            problemContext: problemContext,
            userCode: userCode,
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
});
