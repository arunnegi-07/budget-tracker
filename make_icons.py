import os
from PIL import Image, ImageDraw, ImageFont

os.makedirs("icons", exist_ok=True)

def render_option_2(scale_size=2048):
    s = scale_size
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Dark obsidian/slate circle (#0F172A)
    pad = int(s * 0.08)
    draw.ellipse(
        [pad, pad, s - pad, s - pad],
        fill=(15, 23, 42, 255),
    )

    # Crisp teal ring (#0D9488)
    ring_pad = int(s * 0.115)
    draw.ellipse(
        [ring_pad, ring_pad, s - ring_pad, s - ring_pad],
        outline=(13, 148, 136, 255),
        width=max(6, int(s * 0.022)),
    )

    # Crisp Rupee (₹) glyph
    symbol = "₹"
    font_size = int(s * 0.46)
    font = None
    for font_path in [
        "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "C:\\Windows\\Fonts\\arialbd.ttf",
    ]:
        if os.path.exists(font_path):
            try:
                test_font = ImageFont.truetype(font_path, font_size)
                bbox = draw.textbbox((0, 0), symbol, font=test_font)
                if (bbox[2] - bbox[0]) > 0 and (bbox[3] - bbox[1]) > 0:
                    font = test_font
                    break
            except Exception:
                pass

    if font is None:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), symbol, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (s - tw) // 2 - bbox[0]
    ty = (s - th) // 2 - bbox[1]
    draw.text((tx, ty), symbol, fill=(248, 250, 252, 255), font=font)

    return img

master = render_option_2(2048)
for size, name in [(192, "icon-192.png"), (512, "icon-512.png")]:
    resized = master.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(os.path.join("icons", name), "PNG")

print("Rendered Option 2 (Dark Circle + Teal Ring)")
