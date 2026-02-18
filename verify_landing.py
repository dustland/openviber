from playwright.sync_api import sync_playwright
import time

def verify_landing():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a large viewport to capture the full design
        context = browser.new_context(viewport={"width": 1440, "height": 3000})
        page = context.new_page()

        print("Navigating to landing page...")
        # Try /landing directly
        try:
            page.goto("http://localhost:6006/landing", timeout=60000)
        except Exception as e:
            print(f"Failed to navigate: {e}")
            # Try to print page content if any
            # print(page.content())
            browser.close()
            return

        print("Waiting for network idle...")
        page.wait_for_load_state("networkidle")

        # Allow animations to play a bit
        time.sleep(3)

        print("Taking screenshot...")
        page.screenshot(path="verification_landing.png", full_page=True)
        print("Screenshot saved to verification_landing.png")

        browser.close()

if __name__ == "__main__":
    verify_landing()
