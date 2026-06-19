#!/usr/bin/env python3
"""绿幕抠像 + 去溢色 + 裁切 + 转 WebP + 生成 PWA 图标。
两套参数：
  A 非绿主体(狗/商品/障碍/金币/气球) -> 低阈值 + 全局去绿(仅当绿占优, 保住黄金色)
  B 含绿主体(绿植)               -> 高阈值 + 仅边缘去绿(保住叶子的绿)
"""
import os
import numpy as np
from PIL import Image, ImageFilter

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")

def chroma_key(path, low, high, despill):
    im = Image.open(path).convert("RGB")
    arr = np.asarray(im).astype(np.float32)
    r, g, b = arr[..., 0].copy(), arr[..., 1].copy(), arr[..., 2].copy()
    gm = g - np.maximum(r, b)                      # 绿色优势度
    t = np.clip((gm - low) / (high - low), 0, 1)   # 0=前景 1=纯绿背景
    alpha = (1.0 - t) * 255.0

    # 去溢色：仅当绿色真正占优(G>R 且 G>B)才压低 G —— 黄/金(R高)不受影响
    green_dom = (g > r + 2) & (g > b + 2)
    cap = np.maximum(r, b) + 8
    gfix = np.minimum(g, cap)
    if despill == "global":
        g = np.where(green_dom, gfix, g)
    else:  # edge：只处理半透明边缘，保住实心绿色(叶子)
        a01 = alpha / 255.0
        edge = (a01 > 0.02) & (a01 < 0.98) & green_dom
        g = np.where(edge, gfix, g)

    out = np.dstack([r, g, b, alpha]).clip(0, 255).astype(np.uint8)
    img = Image.fromarray(out)
    aimg = img.getchannel("A").filter(ImageFilter.GaussianBlur(0.6))
    img.putalpha(aimg)
    return img

def bbox_of(img, thresh=20):
    a = np.asarray(img.getchannel("A"))
    ys, xs = np.where(a > thresh)
    if len(xs) == 0:
        return (0, 0, img.width, img.height)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)

def pad_box(box, w, h, pad):
    return (max(0, box[0] - pad), max(0, box[1] - pad), min(w, box[2] + pad), min(h, box[3] + pad))

def save_webp(img, name, q):
    p = os.path.join(DIR, name + ".webp")
    img.save(p, "WEBP", quality=q, method=6)
    print(f"  -> {name}.webp  {os.path.getsize(p)//1024} KB  {img.size}")

A = dict(low=24, high=120, despill="global")   # 非绿主体
B = dict(low=115, high=205, despill="edge")    # 绿植

# ---- 狗三帧：统一裁切框 ----
dog = ["westie_run", "westie_run2", "westie_jump"]
dog_imgs = {n: chroma_key(os.path.join(DIR, n + ".png"), **A) for n in dog}
boxes = [bbox_of(im) for im in dog_imgs.values()]
union = (min(b[0] for b in boxes), min(b[1] for b in boxes),
         max(b[2] for b in boxes), max(b[3] for b in boxes))
W0, H0 = next(iter(dog_imgs.values())).size
union = pad_box(union, W0, H0, 14)
print("dog union box:", union)
for n, im in dog_imgs.items():
    save_webp(im.crop(union), n, 92)

# ---- 其它精灵 ----
for n in ["item_bone", "item_bag", "item_coffee", "item_toy", "coin",
          "obs_cart", "obs_cone", "obs_box", "prop_balloons"]:
    im = chroma_key(os.path.join(DIR, n + ".png"), **A)
    save_webp(im.crop(pad_box(bbox_of(im), im.width, im.height, 10)), n, 90)

im = chroma_key(os.path.join(DIR, "prop_plant.png"), **B)
save_webp(im.crop(pad_box(bbox_of(im), im.width, im.height, 10)), "prop_plant", 90)

# ---- 不透明大图 ----
for n, q in [("bg_street", 84), ("bg_ground", 86), ("title_hero", 86)]:
    im = Image.open(os.path.join(DIR, n + ".png")).convert("RGB")
    save_webp(im, n, q)

# ---- PWA 图标 ----
icon = Image.open(os.path.join(DIR, "icon.png")).convert("RGB")
sz = min(icon.size)
icon = icon.crop(((icon.width - sz) // 2, (icon.height - sz) // 2,
                  (icon.width + sz) // 2, (icon.height + sz) // 2))
for s, name in [(512, "icon-512.png"), (192, "icon-192.png"), (180, "apple-touch-icon.png")]:
    icon.resize((s, s), Image.LANCZOS).save(os.path.join(DIR, name), "PNG")
    print(f"  -> {name}")
print("DONE")
