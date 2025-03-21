// Background service worker for the LeetCode Buddy extension

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "sendToGemini") {
    console.log("Received request to send to Gemini");

    // Handle the request asynchronously and keep message channel open
    sendToGemini(request)
      .then((response) => {
        console.log("Got response from Gemini API, sending back to popup");
        sendResponse({
          success: true,
          data: response,
        });
      })
      .catch((error) => {
        console.error("Error from Gemini API:", error);
        sendResponse({
          success: false,
          error: error.message || "Error communicating with Gemini API",
        });
      });
    return true; // Keep the message channel open for async response
  }
});

// Function to send a message to the Gemini API
async function sendToGemini(request) {
  const {
    apiKey,
    message,
    problemContext,
    userCode,
    chatHistory = [],
  } = request;

  try {
    // Construct the API URL
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    // Create the prompt with chat history
    const prompt = constructPrompt(
      message,
      problemContext,
      userCode,
      chatHistory
    );

    console.log(
      "Sending request to Gemini API with chat history:",
      chatHistory.length > 0
    );

    // Make the API request
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage =
        errorData.error?.message ||
        `Error ${response.status}: ${response.statusText}`;
      console.error("API error:", errorMessage);
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log("Received response from Gemini API");

    // Extract and return the text from the response
    if (
      data.candidates &&
      data.candidates.length > 0 &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts.length > 0
    ) {
      return data.candidates[0].content.parts[0].text;
    } else {
      console.error("Invalid response format:", data);
      throw new Error("Invalid response format from Gemini API");
    }
  } catch (error) {
    console.error("Error in sendToGemini:", error);

    // Provide more user-friendly error messages
    if (error.message.includes("API key not valid")) {
      throw new Error(
        "Invalid API key. Please check your Gemini API key and try again."
      );
    } else if (error.message.includes("quota")) {
      throw new Error(
        "API quota exceeded. Please try again later or check your API usage limits."
      );
    } else if (error.message.includes("models/gemini-1.5-flash")) {
      throw new Error(
        "Model 'gemini-1.5-flash' is not available. Please check if you have access to this model."
      );
    }

    throw error;
  }
}

// Construct a prompt with all the necessary context and chat history
function constructPrompt(message, problemContext, userCode, chatHistory = []) {
  let conversationContext = "";

  // Include chat history if available
  if (chatHistory && chatHistory.length > 0) {
    conversationContext = "\nPrevious conversation:\n";

    // Only include up to the last 10 messages to avoid very long prompts
    const recentHistory = chatHistory.slice(-10);

    recentHistory.forEach((item) => {
      if (item.role === "user") {
        conversationContext += "USER: " + item.content + "\n";
      } else if (item.role === "assistant") {
        conversationContext += "ASSISTANT: " + item.content + "\n";
      }
    });

    conversationContext += "\nCurrent message:\n";
  }

  const problemContextStr = problemContext || "(No problem context available)";
  const userCodeStr = userCode || "(No user code available)";

  return (
    "You are an expert programming assistant with deep knowledge of algorithms, data structures, and problem-solving techniques for coding interviews.\n\n" +
    "CONTEXT:\n" +
    "- The user is working on a LeetCode problem\n" +
    "- You need to provide helpful guidance and feedback on their code\n" +
    "- Your goal is to help them understand the solution and improve their coding skills\n\n" +
    "PROBLEM DESCRIPTION:\n" +
    "```\n" +
    problemContextStr +
    "\n```\n\n" +
    "USER CODE:\n" +
    "```\n" +
    userCodeStr +
    "\n```\n\n" +
    conversationContext +
    'USER QUERY: "' +
    message +
    '"\n\n' +
    "RESPONSE GUIDELINES:\n" +
    "1. First, understand the problem statement completely\n" +
    "2. Analyze the user's code with extreme accuracy by tracing through multiple examples including edge cases\n" +
    "3. Pay special attention to these common issues:\n" +
    "   - Stack problems: Check if all push/pop operations are correct AND verify final stack emptiness check\n" +
    "   - Array/string problems: Verify index boundaries and off-by-one errors\n" +
    "   - Recursive solutions: Ensure proper base cases and recursion depth\n" +
    "   - Tree/graph problems: Confirm complete traversal and correct node processing\n" +
    "4. If you find issues, explain them with specific examples showing incorrect behavior\n" +
    "5. If the code has a bug, provide clear guidance on how to fix it (not just what's wrong)\n" +
    "6. Always validate your analysis by double-checking your reasoning\n\n" +
    "IMPORTANT NOTES:\n" +
    "- Be precise about identifying bugs - provide concrete examples\n" +
    "- For the Valid Parentheses problem specifically, ensure the code checks if the stack is empty at the end\n" +
    "- Common error pattern: returning True without checking if all opening brackets are matched\n" +
    "- Be clear, concise, and technical in your explanations\n" +
    "- Only suggest changes that are necessary to fix the solution\n\n" +
    "FORMAT YOUR RESPONSE IN A STRUCTURED WAY:\n" +
    "1. Brief assessment of the approach\n" +
    "2. Code analysis with examples (including edge cases)\n" +
    "3. Issues identified (if any)\n" +
    "4. Suggested improvements\n" +
    "5. Time and space complexity\n\n" +
    "You are now analyzing the code and preparing your response..."
  );
}
