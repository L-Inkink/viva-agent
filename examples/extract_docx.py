# 一次性工具：从 docx 提取纯文本（docx = zip 里的 word/document.xml）
# 用法: python extract_docx.py <input.docx> <output.md>
import re
import sys
import zipfile
from html import unescape

src, dst = sys.argv[1], sys.argv[2]
xml = zipfile.ZipFile(src).read("word/document.xml").decode("utf-8")

lines = []
for para in xml.split("</w:p>"):
    # 词边界：避免 <w:tabs>/<w:tc> 等同前缀标签被误匹配
    runs = re.findall(r"<w:t(?: [^>]*)?>(.*?)</w:t>", para, re.S)
    lines.append(unescape("".join(runs)).strip())

text = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip() + "\n"
with open(dst, "w", encoding="utf-8") as f:
    f.write(text)
print(f"{dst}: {len(text)} chars")
