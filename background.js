// Background service worker for the LeetCode Buddy extension

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "sendToGemini") {
    sendToGemini(request)
      .then((response) => {
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

  // Construct the API URL
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  // Create the prompt
  const prompt = constructPrompt(message, problemContext, userCode);

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
    throw new Error(errorData.error?.message || "Error calling Gemini API");
  }

  const data = await response.json();

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
    throw new Error("Invalid response format from Gemini API");
  }
}

// Construct a prompt with all the necessary context
function constructPrompt(userMessage, problemContext, userCode) {
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
"${userMessage}"

Respond in a helpful, educational manner. If they ask for help or hints, avoid giving full solutions right away - instead, guide them step by step. Use markdown formatting for code snippets where appropriate. Keep your responses focused on the LeetCode problem at hand.`;
}
