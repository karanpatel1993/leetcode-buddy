// Content script that runs on LeetCode problem pages

console.log("LeetCode Buddy content script loaded");

// Prevent duplicate script execution
if (window.leetCodeBuddyInjected) {
  console.log(
    "LeetCode Buddy content script already running, skipping execution"
  );
} else {
  window.leetCodeBuddyInjected = true;

  // Listen for messages from the popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Message received in content script:", request);

    if (request.action === "getProblemContext") {
      try {
        const problemData = extractProblemData();
        console.log("Problem data extracted successfully:", problemData);
        sendResponse({
          success: true,
          ...problemData,
        });
      } catch (error) {
        console.error("Error extracting problem data:", error);
        sendResponse({
          success: false,
          error: error.message,
        });
      }
    }
    return true; // Keep the message channel open for async response
  });
}

// Extract problem data from the current LeetCode page
function extractProblemData() {
  console.log("Extracting problem data from LeetCode page");

  // Dump page info for debugging
  console.log("Page URL:", window.location.href);
  console.log("Page title:", document.title);

  // Create a debug snapshot of key page elements
  const debugSnapshot = {
    bodyClasses: document.body.className,
    mainContentExists: !!document.querySelector("main"),
    h4Count: document.querySelectorAll("h4").length,
    pCount: document.querySelectorAll("p").length,
  };
  console.log("Page debug snapshot:", debugSnapshot);

  // Get problem title - try multiple selectors to improve reliability
  let title = "";
  const titleSelectors = [
    '[data-cy="question-title"]',
    ".css-v3d350",
    'div[class*="content__"] h4',
    ".question-title",
    // New selectors
    "h4",
    ".title",
    '[class*="title"]',
  ];

  for (const selector of titleSelectors) {
    const elements = document.querySelectorAll(selector);
    console.log(
      `Found ${elements.length} elements matching selector "${selector}"`
    );

    if (elements.length > 0) {
      // Look for the most likely title element (usually contains the problem name from the URL)
      const problemName = window.location.pathname.split("/")[2];
      for (const el of elements) {
        if (
          el.textContent.toLowerCase().includes(problemName.replace(/-/g, " "))
        ) {
          title = el.textContent.trim();
          console.log(`Found title match with selector "${selector}":`, title);
          break;
        }
      }

      // If we didn't find a specific match, just use the first element
      if (!title && elements.length > 0) {
        title = elements[0].textContent.trim();
        console.log(`Using first element from selector "${selector}":`, title);
      }

      if (title) break;
    }
  }

  // Try to extract from the document title as a last resort
  if (!title && document.title) {
    const matches = document.title.match(/(.+)\s+-\s+LeetCode/i);
    if (matches && matches[1]) {
      title = matches[1].trim();
      console.log("Extracted title from document title:", title);
    }
  }

  // Get difficulty - try multiple selectors
  let difficulty = "";
  const difficultySelectors = [
    ".css-10o4wqw",
    ".difficulty-label",
    "div[diff]",
    'span[class*="diff"]',
    // Additional selectors
    '[class*="Difficulty"]',
    '[class*="difficulty"]',
  ];

  for (const selector of difficultySelectors) {
    const elements = document.querySelectorAll(selector);
    console.log(
      `Found ${elements.length} elements matching selector "${selector}"`
    );

    if (elements.length > 0) {
      for (const el of elements) {
        const text = el.textContent.trim();
        if (text.match(/easy|medium|hard/i)) {
          difficulty = text;
          console.log(
            `Found difficulty match with selector "${selector}":`,
            difficulty
          );
          break;
        }
      }

      if (difficulty) break;
    }
  }

  // Try alternative approach for difficulty
  if (!difficulty) {
    // Look for text content containing "Easy", "Medium", or "Hard"
    const allElements = document.querySelectorAll("span, div");
    for (const el of allElements) {
      const text = el.textContent.trim();
      if (text.match(/^(Easy|Medium|Hard)$/i)) {
        difficulty = text;
        console.log("Found difficulty text in element:", difficulty);
        break;
      }
    }
  }

  // Get problem description - try multiple selectors
  let problemContext = "";
  const descriptionSelectors = [
    '[data-cy="question-content"]',
    ".question-content",
    'div[class*="description"]',
    'div[class*="content__"]',
    // New selectors
    "main div[class]",
    'div[role="tabpanel"]',
  ];

  for (const selector of descriptionSelectors) {
    const elements = document.querySelectorAll(selector);
    console.log(
      `Found ${elements.length} elements matching selector "${selector}"`
    );

    if (elements.length > 0) {
      // Try to find an element that contains substantial text
      for (const el of elements) {
        if (el.textContent.length > 100) {
          problemContext = el.textContent.trim();
          console.log(
            `Found problem context with selector "${selector}"`,
            problemContext.substring(0, 100) + "..."
          );
          break;
        }
      }

      if (problemContext) break;
    }
  }

  // If we still don't have problem context, try a broader approach
  if (!problemContext) {
    console.log("Trying broader approach for problem context");
    const mainContent =
      document.querySelector("main") || document.querySelector("body");
    if (mainContent) {
      // Try to find the problem description by looking for specific content markers
      const paragraphs = mainContent.querySelectorAll("p");
      console.log(`Found ${paragraphs.length} paragraphs in main content`);

      const contentTexts = [];

      paragraphs.forEach((p) => {
        if (p.textContent.length > 20) {
          // Only consider substantial paragraphs
          contentTexts.push(p.textContent.trim());
        }
      });

      if (contentTexts.length > 0) {
        problemContext = contentTexts.join("\n\n");
        console.log(
          "Built problem context from paragraphs:",
          problemContext.substring(0, 100) + "..."
        );
      }
    }
  }

  // Get user code from the editor
  let userCode = "";
  try {
    console.log("Trying to extract user code");

    // Try Monaco editor first
    const editorContainer = document.querySelector(".monaco-editor");
    if (editorContainer) {
      console.log("Found Monaco editor");
      const codeLines = editorContainer.querySelectorAll(".view-line");
      console.log(`Found ${codeLines.length} code lines in Monaco editor`);

      if (codeLines.length > 0) {
        userCode = Array.from(codeLines)
          .map((line) => line.textContent)
          .join("\n");
        console.log("Extracted user code from Monaco editor");
      }
    }

    // If we couldn't get the code from Monaco, try CodeMirror
    if (!userCode) {
      const textarea = document.querySelector(".CodeMirror-code");
      if (textarea) {
        console.log("Found CodeMirror editor");
        userCode = textarea.textContent;
        console.log("Extracted user code from CodeMirror");
      }
    }

    // Try other editor selectors
    if (!userCode) {
      const editorSelectors = [
        'textarea[name="code"]',
        "#code-editor",
        ".CodeMirror",
        'div[role="code"]',
        // Additional selectors
        "pre.CodeMirror-line",
        ".ace_content",
        '[class*="editor"]',
      ];

      for (const selector of editorSelectors) {
        const elements = document.querySelectorAll(selector);
        console.log(
          `Found ${elements.length} elements matching selector "${selector}"`
        );

        if (elements.length > 0) {
          userCode = elements[0].textContent.trim();
          console.log(`Extracted user code with selector "${selector}"`);
          break;
        }
      }
    }
  } catch (e) {
    console.error("Error getting user code:", e);
  }

  // Get examples
  const examples = [];
  const exampleSelectors = [
    '[data-cy="question-content"] pre',
    "pre",
    ".example",
    'div[class*="example"]',
    // Additional selectors
    "code",
    ".sample-test",
  ];

  for (const selector of exampleSelectors) {
    const exampleBlocks = document.querySelectorAll(selector);
    console.log(
      `Found ${exampleBlocks.length} example blocks with selector "${selector}"`
    );

    if (exampleBlocks.length > 0) {
      exampleBlocks.forEach((block) => {
        examples.push(block.textContent.trim());
      });
      console.log(
        `Added ${exampleBlocks.length} examples from selector "${selector}"`
      );
      break;
    }
  }

  // Get constraints
  let constraints = "";

  // Custom contains selector function since :contains is not standard
  const findElementWithText = (selector, text) => {
    const elements = document.querySelectorAll(selector);
    for (let i = 0; i < elements.length; i++) {
      if (elements[i].textContent.includes(text)) {
        return elements[i];
      }
    }
    return null;
  };

  const constraintsParagraph =
    findElementWithText("p", "Constraints:") ||
    findElementWithText("p", "constraints") ||
    findElementWithText("strong", "Constraints");

  if (constraintsParagraph) {
    console.log(
      "Found constraints paragraph:",
      constraintsParagraph.textContent
    );
    constraints = constraintsParagraph.textContent.trim();

    // Try to get the subsequent list items
    let nextElement = constraintsParagraph.nextElementSibling;
    if (nextElement && nextElement.tagName === "UL") {
      const listItems = nextElement.querySelectorAll("li");
      console.log(`Found ${listItems.length} constraint list items`);

      if (listItems.length > 0) {
        constraints +=
          "\n" +
          Array.from(listItems)
            .map((li) => li.textContent.trim())
            .join("\n");
      }
    }
  }

  console.log("Extracted problem data:", {
    title,
    difficulty,
    problemContextLength: problemContext ? problemContext.length : 0,
    userCodeLength: userCode ? userCode.length : 0,
    examplesCount: examples.length,
    constraintsLength: constraints ? constraints.length : 0,
  });

  // If we failed to get a proper title, try to get it from URL
  if (!title || title === "Unknown Problem") {
    try {
      const pathSegments = window.location.pathname.split("/");
      if (pathSegments.length >= 3) {
        const problemSlug = pathSegments[2];
        title = problemSlug
          .split("-")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
        console.log("Generated title from URL:", title);
      }
    } catch (e) {
      console.error("Error generating title from URL:", e);
    }
  }

  return {
    title: title || "Unknown Problem",
    difficulty: difficulty || "Unknown",
    problemContext:
      problemContext ||
      "Could not extract problem description. Please try refreshing the page.",
    userCode: userCode || "",
    examples: examples.join("\n\n") || "",
    constraints: constraints || "",
  };
}
