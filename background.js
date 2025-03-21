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
  const { apiKey, message, problemContext, userCode } = request;

  try {
    // Construct the API URL
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    // Create the prompt
    const prompt = constructPrompt(message, problemContext, userCode);

    console.log("Sending request to Gemini API");

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

// Construct a prompt with all the necessary context
function constructPrompt(message, problemContext, userCode) {
  return `You are "LeetCode Buddy", an AI assistant specialized in helping users with LeetCode problems.
You provide help, hints, and feedback on code solutions.

The user is working on the following LeetCode problem:
-----
${problemContext || "(No problem context available)"}
-----

The user has written the following code:
\`\`\`
${userCode || "(No user code available)"}
\`\`\`

The user asks:
"${message}"

Respond in a helpful, educational manner. If they ask for help or hints, avoid giving full solutions right away - instead, guide them step by step. If they follow up specifically asking for code after your explanation, focus on explaining key concepts or small code snippets rather than complete solutions.

When reviewing code or pointing out issues, focus on explaining the problems and suggesting improvements rather than rewriting the entire solution.

Use markdown formatting for code snippets where appropriate. Keep your responses focused on the LeetCode problem at hand.`;
}
