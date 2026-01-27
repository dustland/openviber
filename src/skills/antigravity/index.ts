import { z } from "zod";
import { BrowserCDP } from "../../tools/browser"; // Import the class directly if needed, or instantiate manually

/**
 * Domain Logic for Antigravity App
 * Encapsulates the specific DOM structure (iframes, selectors)
 */
export function getTools() {
  return {
    antigravity_check_status: {
      description: "Analyze the Antigravity IDE state to detect critical errors.",
      inputSchema: z.object({}),
      execute: async () => {
        const cdp = new BrowserCDP({ port: 9333 });
        const targets = await cdp.listTargets();

        console.log(`[Antigravity] Found ${targets.length} targets:`, targets.map(t => ({ type: t.type, url: t.url?.slice(0, 60) })));

        // Get ALL pages (not just the first one) - there may be multiple Antigravity windows
        const pages = targets.filter(t => t.type === 'page' && !t.url.startsWith('chrome'));

        if (pages.length === 0) {
          return { status: "UNKNOWN", message: "No active browser page found." };
        }

        console.log(`[Antigravity] Checking ${pages.length} page(s) for errors...`);

        // Check ALL pages for errors, not just the first one
        for (const page of pages) {
          console.log(`[Antigravity] Checking page: ${page.url?.slice(0, 80)}`);

          // Inject the specific JS to find the error in #cascade container inside the iframe
          const result = await cdp.evaluate(page, `
                (function() {
                  // First, locate the Antigravity agent panel iframe
                  const iframe = document.getElementById('antigravity.agentPanel');
                  if (!iframe) {
                    return {
                      hasError: false,
                      hasRetryButton: false,
                      cascadeFound: false,
                      iframeFound: false,
                      textSnippet: 'Iframe not found'
                    };
                  }
                  
                  // Access the iframe's document
                  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (!iframeDoc) {
                    return {
                      hasError: false,
                      hasRetryButton: false,
                      cascadeFound: false,
                      iframeFound: true,
                      textSnippet: 'Cannot access iframe document'
                    };
                  }
                  
                  // Antigravity chat panel lives in #cascade container inside the iframe
                  const cascadeEl = iframeDoc.getElementById('cascade');
                  const searchDoc = cascadeEl || iframeDoc;
                  const searchText = (cascadeEl ? cascadeEl.innerText : iframeDoc.body?.innerText) || '';
                  
                  // Check for error by text content
                  const hasError = searchText.includes('Agent terminated due to error');
                  
                  // Look for Retry button
                  let retryBtn = null;
                  if (hasError) {
                    const buttons = searchDoc.querySelectorAll('button');
                    retryBtn = Array.from(buttons).find(
                      b => b.textContent.trim() === 'Retry'
                    );
                  }
                  
                  return {
                    hasError: !!hasError,
                    hasRetryButton: !!retryBtn,
                    cascadeFound: !!cascadeEl,
                    iframeFound: true,
                    textSnippet: searchText.slice(0, 300)
                  };
                })()
          `);

          console.log(`[Antigravity] Check result for ${page.url?.slice(0, 40)}:`, JSON.stringify(result, null, 2));

          // If this page has an error, return immediately
          if (result?.hasError) {
            return {
              status: "CRITICAL_ERROR",
              details: "Agent terminated due to error",
              canRecover: result.hasRetryButton,
              pageUrl: page.url
            };
          }
        }

        // No errors found in any page
        return { status: "NOMINAL", details: `Checked ${pages.length} page(s), all healthy` };
      },
    },

    antigravity_recover: {
      description: "Attempt to recover the Antigravity agent from a critical error.",
      inputSchema: z.object({}),
      execute: async () => {
        const cdp = new BrowserCDP({ port: 9333 });
        const targets = await cdp.listTargets();
        const pages = targets.filter(t => t.type === 'page' && !t.url.startsWith('chrome'));

        if (pages.length === 0) return { success: false, message: "No page found" };

        console.log(`[Antigravity] Recover: checking ${pages.length} page(s) for Retry button...`);

        // Try to find and click Retry button in ANY page
        for (const page of pages) {
          console.log(`[Antigravity] Recover: checking page ${page.url?.slice(0, 60)}`);

          // Click Retry button in #cascade container inside the iframe
          const clicked = await cdp.evaluate(page, `
                (function() {
                  // First, locate the Antigravity agent panel iframe
                  const iframe = document.getElementById('antigravity.agentPanel');
                  if (!iframe) return false;
                  
                  // Access the iframe's document
                  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                  if (!iframeDoc) return false;
                  
                  const cascadeEl = iframeDoc.getElementById('cascade');
                  const searchDoc = cascadeEl || iframeDoc;
                  
                  const buttons = searchDoc.querySelectorAll('button');
                  const retryBtn = Array.from(buttons).find(
                     b => b.textContent.trim() === 'Retry'
                  );
                  
                  if (retryBtn) {
                     retryBtn.click();
                     return true;
                  }
                  return false;
                })()
          `);

          if (clicked) {
            return { success: true, message: `Clicked 'Retry' button in ${page.url?.slice(0, 60)}` };
          }
        }

        return { success: false, message: `Could not find 'Retry' button in any of ${pages.length} page(s).` };
      },
    }
  };
}
