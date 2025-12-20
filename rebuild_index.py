import os
import re
from datetime import datetime
from bs4 import BeautifulSoup

TEMPLATE_FILE = "template.html"
BLOG_INDEX_FILE = "blog"

# Files to exclude from the blog index
EXCLUDES = [
    "index.html", 
    "template.html", 
    "blog",            # The output file itself (though it has no extension, we check filename)
    "about", 
    "now", 
    "date",
    "style.css",
    "migrate.py",
    "migrate_substack.py",
    "rebuild_index.py",
    "google", # google generic verification files etc
]

def get_title_and_date(filepath):
    """
    Extracts title and attempts to find a date in the HTML file.
    """
    with open(filepath, "r") as f:
        content = f.read()
    
    soup = BeautifulSoup(content, 'html.parser')
    
    # Title from <title> tag
    title_tag = soup.find('title')
    title = title_tag.get_text(strip=True).split("|")[0].strip() if title_tag else os.path.basename(filepath)
    
    # Date
    # We might have injected it as <em>YYYY-MM-DD</em> in migrate_substack
    # Or seemingly no standard place in the other migration. 
    # Let's look for known patterns or file metadata if not found.
    # The migrate.py used frontmatter date. And it didn't explicitly inject the date into the HTML body except maybe implicitly?
    # Wait, migrate.py DID NOT inject the date into the body.
    # "inner_html = f"{html_body}" ... final_html = pre_content + inner_html..."
    # So the old migrated files DON'T have the date visible!
    # That's a potential issue.
    # However, for Sorting the index, we need the date.
    # We can try to infer it from filename? some have dates. 
    # Or we can re-parse the source markdown if we want to be perfect, but that's complex since we have detached HTMLs now.
    # BUT, we have `migrate.py` which had the logic.
    # Ideally, I should have saved the date in the HTML, maybe as a meta tag or hidden comment.
    
    # For now, let's look for a date-like pattern in the filename for the old posts (e.g. 12-nov-2022.md -> 12-nov-2022)
    # And for substack posts, I injected <em>YYYY-MM-DD</em>.
    
    date_str = ""
    
    # Check for emitted date in em tag
    em_date = soup.find('em')
    if em_date:
        text = em_date.get_text()
        # Simple check if it looks like a date
        if re.match(r'\d{4}-\d{2}-\d{2}', text):
            date_str = text
            
    if not date_str:
        # Check filename
        filename = os.path.basename(filepath)
        # Try finding YYYY-MM-DD or DD-MMM-YYYY
        # 12-nov-2022
        match = re.search(r'(\d{1,2}-[a-zA-Z]{3}-\d{4})', filename)
        if match:
            # Parse 12-nov-2022
            try:
                dt = datetime.strptime(match.group(1), "%d-%b-%Y")
                date_str = dt.strftime("%Y-%m-%d")
            except:
                pass
        
        if not date_str:
            # 2022-09-26-title
             match = re.search(r'(\d{4}-\d{2}-\d{2})', filename)
             if match:
                 date_str = match.group(1)

    # Fallback: file modification time? No, that's "now".
    # If we can't find a date, we put it at the end or use a default.
    return title, date_str or "1970-01-01"

def main():
    # Gather files
    files = []
    for f in os.listdir("."):
        if os.path.isfile(f):
            # Skip hidden, excluded, or non-html
            if f.startswith("."): continue
            if f in EXCLUDES: continue
            if not f.endswith(".html"): continue
            
            files.append(f)
            
    posts = []
    for filename in files:
        title, date_str = get_title_and_date(filename)
        posts.append({
            "title": title,
            "date": date_str,
            "slug": filename 
        })
        
    # Sort posts
    posts.sort(key=lambda x: x["date"], reverse=True)
    
    # Read template
    with open(TEMPLATE_FILE, "r") as f:
        template = f.read()

    blog_content = template.replace("PAGE TITLE HERE", "Blog").replace("SITE NAME HERE", "Ilyaas Kapadia")
    
    # Construct list
    list_html = "<ul>\n"
    for post in posts:
        # Create a nice display date?
        display_date = post['date']
        if display_date == "1970-01-01":
            display_date = ""
            
        list_html += f'<li>{display_date}: <a href="{post["slug"]}">{post["title"]}</a></li>\n'
    list_html += "</ul>"
    
    # Insert list
    # Use split on title or similar anchor
    parts = blog_content.split("<h2>Blog</h2>")
    if len(parts) >= 2:
        # Reconstruct
        # parts[0] includes everything up to <h2>Blog</h2>. 
        # But split removes the separator. So we add it back.
        
        final_html = parts[0] + "<h2>Blog</h2>\n" + list_html + "\n</body>\n</html>"
        
        with open(BLOG_INDEX_FILE, "w") as f:
            f.write(final_html)
        print(f"Index rebuilt with {len(posts)} posts.")

if __name__ == "__main__":
    main()
