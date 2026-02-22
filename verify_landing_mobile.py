from playwright.sync_api import sync_playwright
import time

def verify_landing_mobile():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use mobile viewport (iPhone 13 dimensions)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()

        print("Navigating to landing page...")
        try:
            page.goto("http://localhost:6006/landing", timeout=60000)
        except Exception as e:
            print(f"Failed to navigate: {e}")
            browser.close()
            return

        print("Waiting for network idle...")
        page.wait_for_load_state("networkidle")

        # Allow animations to play a bit
        time.sleep(3)

        print("Taking mobile screenshot...")
        page.screenshot(path="verification_landing_mobile.png", full_page=True)
        print("Screenshot saved to verification_landing_mobile.png")

        browser.close()

if __name__ == "__main__":
    verify_landing_mobile()
