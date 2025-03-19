document.addEventListener("DOMContentLoaded", () => {
  const messageInput = document.getElementById("message-input");
  const sendButton = document.getElementById("send-button");
  const chatContainer = document.getElementById("chat-container");
  const spinner = document.getElementById("spinner");
  const sendIcon = document.getElementById("send-icon");
  const statusElement = document.getElementById("status");
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
      chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
        apiKeyContainer.style.display = "none";
        chatInterface.style.display = "flex";
        checkIfOnLeetCode();
      });
    }
  });

  // Check if we're on a LeetCode problem page
  function checkIfOnLeetCode() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0].url;
      if (url.includes("leetcode.com/problems/")) {
        statusElement.textContent = "Connected to LeetCode";
        statusElement.style.color = "white";

        // Get problem context from the page
        getProblemContext(tabs[0].id);
      } else {
        statusElement.textContent = "Not on LeetCode";
        statusElement.style.color = "#ffcccc";
        problemTitleElement.textContent =
          "Please navigate to a LeetCode problem";
        problemDifficultyElement.textContent = "";
      }
    });
  }

  function getProblemContext(tabId) {
    retryCount = 0;
    statusElement.textContent = "Extracting problem data...";

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
            statusElement.textContent = "Ready";
            statusElement.style.color = "white";
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
      statusElement.textContent = `Retrying (${retryCount}/${MAX_RETRIES})...`;

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
      statusElement.textContent = "Failed to get problem context";
      statusElement.style.color = "#ffcccc";

      // Add retry button to UI
      const retryButton = document.createElement("button");
      retryButton.textContent = "Retry";
      retryButton.style.marginLeft = "8px";
      retryButton.style.padding = "2px 8px";
      retryButton.style.backgroundColor = "#2cbb5d";
      retryButton.style.color = "white";
      retryButton.style.border = "none";
      retryButton.style.borderRadius = "4px";
      retryButton.style.cursor = "pointer";

      retryButton.addEventListener("click", () => {
        statusElement.textContent = "Retrying...";
        retryButton.remove();

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          retryCount = 0;
          // When manually retrying, always re-inject the content script
          injectContentScript(tabs[0].id);
        });
      });

      statusElement.appendChild(retryButton);
    }
  }

  function updateProblemInfo(response) {
    if (response.title) {
      problemTitleElement.textContent = response.title;
    }

    if (response.difficulty) {
      let difficultyColor = "#00af9b"; // Easy
      if (response.difficulty === "Medium") {
        difficultyColor = "#ffb800";
      } else if (response.difficulty === "Hard") {
        difficultyColor = "#ff2d55";
      }

      problemDifficultyElement.textContent = response.difficulty;
      problemDifficultyElement.style.color = difficultyColor;
    }
  }

  // Send message to Gemini
  async function sendMessageToGemini(message) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(["geminiApiKey"], (result) => {
        if (!result.geminiApiKey) {
          reject("API key not found. Please set your Gemini API key.");
          return;
        }

        // Send request to background script to avoid CORS issues
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
              reject("Error: " + chrome.runtime.lastError.message);
              return;
            }

            if (response && response.success) {
              resolve(response.data);
            } else {
              reject(
                response ? response.error : "Failed to get response from Gemini"
              );
            }
          }
        );
      });
    });
  }

  // Add a message to the chat
  function addMessage(text, isUser) {
    const messageElement = document.createElement("div");
    messageElement.classList.add("message");
    messageElement.classList.add(isUser ? "user-message" : "bot-message");

    // Process markdown-like formatting for code blocks
    if (!isUser && text.includes("```")) {
      const segments = text.split(/```([\s\S]*?)```/);

      segments.forEach((segment, index) => {
        if (index % 2 === 0) {
          // Regular text
          if (segment.trim()) {
            const textNode = document.createElement("div");
            textNode.innerHTML = segment
              .replace(/\n/g, "<br>")
              .replace(/`([^`]+)`/g, "<code>$1</code>");
            messageElement.appendChild(textNode);
          }
        } else {
          // Code block
          const codeBlock = document.createElement("pre");
          codeBlock.classList.add("code-block");
          codeBlock.textContent = segment.trim();
          messageElement.appendChild(codeBlock);
        }
      });
    } else {
      // Regular text without code blocks
      messageElement.innerHTML = text
        .replace(/\n/g, "<br>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");
    }

    chatContainer.appendChild(messageElement);
    chatContainer.scrollTop = chatContainer.scrollHeight;
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

      try {
        const response = await sendMessageToGemini(message);
        addMessage(response, false);
      } catch (error) {
        addMessage("Error: " + error, false);
      } finally {
        messageInput.disabled = false;
        sendButton.disabled = false;
        spinner.style.display = "none";
        sendIcon.style.display = "block";
        messageInput.focus();
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

  // Focus input field on load
  messageInput.focus();
});
