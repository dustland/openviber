import { z } from "zod";
import { BrowserCDP, CDPTarget } from "../../tools/browser";

/**
 * Domain Logic for Antigravity App
 * Auto-healer that detects and recovers from agent errors
 */

// Helper function to click the Retry button
async function clickRetryButton(cdp: BrowserCDP, page: CDPTarget): Promise<boolean> {
  const clicked = await cdp.evaluate(page, `
    (function() {
      const iframe = document.getElementById('antigravity.agentPanel');
      if (!iframe) return false;
      
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
  return !!clicked;
}

export function getTools() {
  return {
    antigravity_check_and_heal: {
      description: "Check Antigravity IDE for errors and automatically recover if found. This is an all-in-one health check that both detects AND fixes issues.",
      inputSchema: z.object({}),
      execute: async () => {
        const cdp = new BrowserCDP({ port: 9333 });
        const targets = await cdp.listTargets();

        const pages = targets.filter(t => t.type === 'page' && !t.url.startsWith('chrome'));

        if (pages.length === 0) {
          return { status: "NO_BROWSER", message: "No active browser page found." };
        }

        // Check ALL pages for errors
        for (const page of pages) {
          let result: any;
          try {
            result = await cdp.evaluate(page, `
              (function() {
                const iframe = document.getElementById('antigravity.agentPanel');
                if (!iframe) {
                  return { hasError: false, hasRetryButton: false, iframeFound: false };
                }
                
                const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!iframeDoc) {
                  return { hasError: false, hasRetryButton: false, iframeFound: true, cannotAccess: true };
                }
                
                const cascadeEl = iframeDoc.getElementById('cascade');
                const searchDoc = cascadeEl || iframeDoc;
                const searchText = (cascadeEl ? cascadeEl.innerText : iframeDoc.body?.innerText) || '';
                
                const hasError = searchText.includes('Agent terminated due to error');
                
                let hasRetryButton = false;
                if (hasError) {
                  const buttons = searchDoc.querySelectorAll('button');
                  hasRetryButton = Array.from(buttons).some(b => b.textContent.trim() === 'Retry');
                }
                
                return { hasError, hasRetryButton, iframeFound: true, cascadeFound: !!cascadeEl };
              })()
            `);
          } catch (err: any) {
            continue; // Skip this page and try the next
          }

          // If error found, AUTO-RECOVER immediately
          if (result?.hasError && result?.hasRetryButton) {
            const clicked = await clickRetryButton(cdp, page);

            if (clicked) {
              return {
                status: "RECOVERED",
                message: `Found error, clicked Retry button automatically`,
                pageUrl: page.url?.slice(0, 80)
              };
            } else {
              console.log(`[Antigravity] ❌ Failed to click Retry button`);
              return {
                status: "RECOVERY_FAILED",
                message: `Found error but failed to click Retry button`,
                pageUrl: page.url?.slice(0, 80)
              };
            }
          }

          // Error without retry button
          if (result?.hasError) {
            return {
              status: "ERROR_NO_RETRY",
              message: `Error detected but no Retry button found`,
              pageUrl: page.url?.slice(0, 80)
            };
          }
        }

        // No errors found
        return { status: "HEALTHY", message: `All ${pages.length} page(s) are healthy` };
      },
    },
  };
}
