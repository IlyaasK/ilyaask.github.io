import os
import re
import markdown
import sys
from datetime import datetime, timezone

# Configuration
SOURCE_DIR = "temp_old_website/content/posts"
OUTPUT_DIR = "."
TEMPLATE_FILE = "template.html"
BLOG_INDEX_FILE = "blog"

def parse_frontmatter(content):
    """
    Parses Hugo-style frontmatter.
    Returns metadata dict and body content.
    """
    if content.startswith("---"):
        parts = content.split("---", 2)
        if len(parts) >= 3:
            frontmatter = parts[1]
            body = parts[2]
            
            meta = {}
            for line in frontmatter.strip().split("\n"):
                if ":" in line:
                    key, val = line.split(":", 1)
                    meta[key.strip()] = val.strip().strip('"').strip("'")
            return meta, body
    return {}, content

def format_date(date_str):
    try:
        # Try parsing ISO format
        # replace Z with +00:00 for python fromisoformat
        date_str = date_str.replace("Z", "+00:00")
        
        # In case of space separators or differing formats
        # Hugo often uses "2022-09-26T19:45:18+05:30"
        dt = datetime.fromisoformat(date_str)
        return dt.strftime("%Y-%m-%d")
    except:
        return date_str

def main():
    # Read template
    with open(TEMPLATE_FILE, "r") as f:
        template = f.read()

    posts = []

    # Process files
    if not os.path.exists(SOURCE_DIR):
        print(f"Source directory {SOURCE_DIR} not found.")
        return

    for filename in os.listdir(SOURCE_DIR):
        if filename.endswith(".md"):
            filepath = os.path.join(SOURCE_DIR, filename)
            with open(filepath, "r") as f:
                content = f.read()

            meta, body = parse_frontmatter(content)
            
            title = meta.get("title", filename.replace(".md", "").replace("-", " ").title())
            date_str = meta.get("date", "")
            
            display_date = format_date(date_str)
            
            # Convert body to HTML
            html_body = markdown.markdown(body, extensions=['extra', 'smarty', 'fenced_code'])
            
            # Prepare output content
            # Template has <h2>{title}</h2>. We will inject date after that.
            
            # Prepare output content
            # Template has <h2>{title}</h2>. We will inject date after that.
            
            output_content = template
            output_content = output_content.replace("PAGE TITLE HERE", title)
            output_content = output_content.replace("SITE NAME HERE", "Ilyaas Kapadia")
            
            # CSS path (same directory)
            # output_content default has href="style.css", so no change needed unless we messed it up
            
            # Injecting into template
            parts = output_content.split(f"<h2>{title}</h2>")
            if len(parts) == 2:
                # Add date block
                date_block = f"<p><em>{display_date}</em></p>" if display_date else ""
                
                # Image path correction: source uses absolute /images/, we want relative images/
                html_body = html_body.replace('src="/images/', 'src="images/')
                html_body = html_body.replace('src="images/', 'src="images/')
                html_body = html_body.replace('href="/images/', 'href="images/')
                html_body = html_body.replace('href="images/', 'href="images/')
                
                pre_content = parts[0] + f"<h2>{title}</h2>\n{date_block}\n"
                
                final_html = pre_content + html_body + "\n</body>\n</html>"
                
                # Write to file with .html extension
                slug = filename.replace(".md", "")
                output_path = os.path.join(OUTPUT_DIR, f"{slug}.html")
                
                with open(output_path, "w") as f:
                    f.write(final_html)
                
                posts.append({
                    "title": title,
                    "date": display_date,
                    "slug": f"{slug}.html"
                })
                print(f"Generated {slug}.html with date {display_date}")

    # Generate Blog Index
    # Sort posts by date desc
    posts.sort(key=lambda x: x["date"], reverse=True)
    
    # We should merge with existing posts? Or migrate_substack will handle its own list?
    # This script handles Hugo posts. 
    # rebuild_index.py handles ALL files. So we don't need to full build index here, 
    # BUT we should ensure date consistency.
    # We rely on rebuild_index.py for the final index file.
    
    print("Hugo Migration Done.")

if __name__ == "__main__":
    main()
