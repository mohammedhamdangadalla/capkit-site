import re, zlib, sys, collections

path = sys.argv[1]
data = open(path, 'rb').read()

print("الحجم:", f"{len(data):,}", "بايت")

# إصدار PDF
m = re.search(rb'%PDF-(\d\.\d)', data)
print("إصدار PDF:", m.group(1).decode() if m else "غير معروف")

# عدد الصفحات
pages = len(re.findall(rb'/Type\s*/Page[^s]', data))
print("عدد الصفحات:", pages)

# مقاسات الصفحات
boxes = re.findall(rb'/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)', data)
sizes = collections.Counter()
for a, b, c, d in boxes:
    w = float(c) - float(a); h = float(d) - float(b)
    sizes[(round(w), round(h))] += 1
print("مقاسات الصفحات (نقاط):", dict(sizes))
for k, v in list(sizes.items())[:1]:
    print(f"  ≈ {k[0]/72*25.4:.0f} × {k[1]/72*25.4:.0f} مم")

# الخطوط
fonts = set(re.findall(rb'/BaseFont\s*/([A-Za-z0-9+\-_,.]+)', data))
print("خطوط مضمّنة:", len(fonts))
for f in sorted(fonts)[:12]:
    print("   ", f.decode('latin-1'))

# الصور
imgs = len(re.findall(rb'/Subtype\s*/Image', data))
print("صور (XObjects):", imgs)

# نصوص: فك ضغط التدفقات وعدّ أوامر النص
streams = 0
text_ops = 0
chars = 0
for m in re.finditer(rb'stream\r?\n', data):
    start = m.end()
    end = data.find(b'endstream', start)
    if end == -1:
        continue
    raw = data[start:end]
    try:
        dec = zlib.decompress(raw)
    except Exception:
        continue
    streams += 1
    text_ops += len(re.findall(rb'\bBT\b', dec))
    chars += len(re.findall(rb'<[0-9A-Fa-f]{4,}>', dec))

print("تدفقات مفكوكة:", streams)
print("بلوكات نصية (BT):", text_ops)
print("سلاسل hex (نص CID):", chars)

# معلومات المستند
info = {}
for key in ('Title', 'Author', 'Producer', 'Creator', 'CreationDate'):
    m = re.search(rb'/' + key.encode() + rb'\s*\(([^)]{0,200})\)', data)
    if m:
        info[key] = m.group(1)[:200]
print("بيانات المستند:", info if info else "لا توجد")

print("موقّع رقمياً:", "نعم" if b'/ByteRange' in data else "لا")
print("مشفّر:", "نعم" if b'/Encrypt' in data else "لا")
