from pathlib import Path
import re

path = Path(r"c:\Users\mrido\OneDrive\Desktop\PUCK'D\puckd (1).html")
text = path.read_text(encoding='utf-8')
pattern = re.compile(r"const DEFAULT_ARTICLES = \[\];\s*\n(?:\s*\{[^;]+?\};\s*\n)*const DEFAULT_HERO_ID = 'a5';", re.DOTALL)
new_text, count = pattern.subn("const DEFAULT_ARTICLES = [];\nconst DEFAULT_HERO_ID = 'a5';", text, count=1)
if count == 0:
    raise SystemExit('Pattern not found')
path.write_text(new_text, encoding='utf-8')
print('patched', count)
