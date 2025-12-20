import os

def main():
    # Iterate over all files in current directory
    for filename in os.listdir("."):
        if filename.endswith(".html") or filename in ["about", "now", "date", "blog"] or (os.path.isfile(filename) and "." not in filename):
            # We are looking for html files or files without extension that are html content (like the migrated posts)
            if filename.startswith("."): continue
            if filename in ["migrate.py", "migrate_substack.py", "rebuild_index.py", "fix_image_paths.py", "netlify.toml"]: continue
            
            filepath = os.path.join(".", filename)
            try:
                with open(filepath, "r") as f:
                    content = f.read()
                
                # Replace absolute /images/ with relative images/
                # Case insensitive just in case, though standard is usually lowercase.
                new_content = content.replace('src="/images/', 'src="images/')
                new_content = new_content.replace('href="/images/', 'href="images/')
                
                # Also handle potentially migrated markdown specific variations if any
                # But mostly Hugo uses /images/
                
                if content != new_content:
                    with open(filepath, "w") as f:
                        f.write(new_content)
                    print(f"Fixed paths in {filename}")
            except Exception as e:
                print(f"Skipping {filename}: {e}")

if __name__ == "__main__":
    main()
