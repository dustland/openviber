from playwright.sync_api import sync_playwright
import os
import time

# List of pages to test
PAGES = [
    "/",
    "/landing",
    "/docs",
    "/hub",
    "/login",
    "/onboarding",
    "/observability",
    "/tasks",
    "/vibers",
    "/settings/general"
]

BASE_URL = "http://localhost:6006"

def verify_mobile_pages():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Emulate a mobile device (iPhone 12 Pro)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1",
            device_scale_factor=3,
            is_mobile=True,
            has_touch=True
        )
        page = context.new_page()

        for path in PAGES:
            url = f"{BASE_URL}{path}"
            print(f"Testing {url}...")
            try:
                page.goto(url, timeout=60000)
                # Wait for network idle to ensure assets are loaded
                try:
                    page.wait_for_load_state("networkidle", timeout=10000)
                except:
                    print(f"Network idle timeout for {path}, proceeding...")

                # Take screenshot
                filename = path.replace("/", "_").strip("_")
                if not filename:
                    filename = "root"
                screenshot_path = f"verification/mobile/{filename}.png"
                page.screenshot(path=screenshot_path, full_page=True)
                print(f"Saved screenshot to {screenshot_path}")
            except Exception as e:
                print(f"Error testing {path}: {e}")

        browser.close()

if __name__ == "__main__":
    verify_mobile_pages()
