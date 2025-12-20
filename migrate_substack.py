import requests
from bs4 import BeautifulSoup
import os
from datetime import datetime

# URLs to migrate
URLS = [
    "https://ilyaas.substack.com/p/death",
    "https://ilyaas.substack.com/p/dan-koes-2-hour-writer",
    "https://ilyaas.substack.com/p/rage",
    "https://ilyaas.substack.com/p/independence",
    "https://ilyaas.substack.com/p/youre-a-man-child",
    "https://ilyaas.substack.com/p/sacrifice",
    "https://ilyaas.substack.com/p/the-unleveraged-life",
    "https://ilyaas.substack.com/p/self-improvement-is-masturbation",
    "https://ilyaas.substack.com/p/this-trade-is-not-worth-it",
    "https://ilyaas.substack.com/p/would-you-make-this-decision-if-women",
    "https://ilyaas.substack.com/p/intrinsic-motivation",
    "https://ilyaas.substack.com/p/dissatisfaction"
]

TEMPLATE_FILE = "template.html"

def get_template():
    with open(TEMPLATE_FILE, "r") as f:
        return f.read()

def process_url(url, session):
    print(f"Fetching {url}...")
    try:
        response = session.get(url)
        if response.status_code != 200:
            print(f"Failed to fetch {url}")
            return

        soup = BeautifulSoup(response.text, 'html.parser')

        # Get Title
        h1 = soup.find('h1', class_='post-title')
        title = h1.get_text(strip=True) if h1 else "Untitled"

        # Get Date
        # Finding: <div class="pencraft ..."><div class"...">Jul 01, 2024</div></div>
        # A bit generic class names "pencraft pc-reset color-pub-secondary-text..."
        # Let's search for the script block or meta data which is more reliable.
        # <script>window._preloads = JSON.parse("...")</script>
        # contains "post_date":"2024-07-01T19:53:50.760Z"
        
        date_display = ""
        
        import json
        
        # Try finding the preloads script
        for script in soup.find_all("script"):
            if script.string and "window._preloads" in script.string:
                try:
                    # Extract JSON string
                    # window._preloads        = JSON.parse("...");
                    start = script.string.find('JSON.parse("') + 12
                    end = script.string.rfind('")')
                    json_str = script.string[start:end]
                    # It's double escaped? JSON.parse("{\"isEU\":...}")
                    # So json_str IS the escaped string.
                    # We need to unescape it?
                    # The content inside quote is \"isEU\", so Python string needs to handle escaping.
                    # Let's just use string replacement or eval if safe (JSON load).
                    
                    # Actually, we can just regex for "post_date":"..."
                    import re
                    match = re.search(r'\\"post_date\\":\\"(.*?)\\"', json_str)
                    if match:
                        date_str = match.group(1)
                        # 2024-07-01T19:53:50.760Z
                        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                        date_display = dt.strftime("%Y-%m-%d")
                        break
                except Exception as e:
                    print(f"JSON extract error: {e}")
        
        if not date_display:
            # Fallback to visual element text if script fails
             # <div class="... meta-EgzBVA">Sep 4, 2024</div> is not it, that's a comment date in snippet
             # The post date text is "Jul 01, 2024" in the snippet.
             # It is in a div with " Jul 01, 2024 "
             # structure: div class="... meta-EgzBVA" > Jul 01, 2024
             # Let's look for known date formats in text nodes?
             pass

        # Get Content
        content_div = soup.find("div", class_="body markup") or soup.find("div", class_="available-content")
        
        if not content_div:
            print(f"Could not find content for {url}")
            return

        body_html = str(content_div)

        # Create HTML file
        template = get_template()
        
        output_content = template
        output_content = output_content.replace("PAGE TITLE HERE", title)
        output_content = output_content.replace("SITE NAME HERE", "Ilyaas Kapadia")
        
        # Insert content
        parts = output_content.split(f"<h2>{title}</h2>")
        if len(parts) == 2:
            pre_content = parts[0] + f"<h2>{title}</h2>\n"
            # Add date
            if date_display:
                pre_content += f"<p><em>{date_display}</em></p>\n"
                
            post_content = "\n</body>\n</html>"
            
            final_html = pre_content + body_html + post_content
            
            # Slug from URL
            slug = url.split("/p/")[-1]
            
            with open(f"{slug}.html", "w") as f:
                f.write(final_html)
            
            print(f"Saved {slug}.html with date {date_display}")
    except Exception as e:
        print(f"Error processing {url}: {e}")

def main():
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0"})
    
    for url in URLS:
        process_url(url, session)

if __name__ == "__main__":
    main()
