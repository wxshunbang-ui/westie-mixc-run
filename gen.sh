#!/bin/bash
# gpt-image batch generator for Westie MixC Run (green-screen pipeline)
# usage: bash gen.sh <asset-name>      (one asset)
#        bash gen.sh list              (print all names)
# parallel: printf '%s\n' a b c | xargs -P 3 -I{} bash gen.sh {}
set -uo pipefail

BASE=http://127.0.0.1:19080
# 本地 gpt-image-server 的 key：从环境变量读取，避免提交进公开仓库
KEY="${GPT_IMAGE_KEY:?请先 export GPT_IMAGE_KEY=<本地 gpt-image-server 的 key>}"
DIR="$(cd "$(dirname "$0")" && pwd)/assets"
mkdir -p "$DIR"

gen() {  # gen <out> <size> <bg> <quality> <prompt>
  local out="$DIR/$1.png" size="$2" bg="$3" quality="$4" prompt="$5" body resp code msg
  body=$(jq -n --arg p "$prompt" --arg s "$size" --arg b "$bg" --arg q "$quality" \
    '{prompt:$p,size:$s,background:$b,quality:$q,format:"png"}')
  for attempt in 1 2 3; do
    resp=$(mktemp)
    code=$(curl -sS -m 300 -o "$resp" -w '%{http_code}' "$BASE/v1/image/generate" \
      -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d "$body" 2>/dev/null)
    if [ "$code" = "200" ]; then
      jq -r '.images[0].b64' "$resp" | base64 -d > "$out" 2>/dev/null
      if [ -s "$out" ]; then echo "OK   $1.png  $(wc -c < "$out") bytes"; rm -f "$resp"; return 0; fi
    fi
    msg=$(jq -r '.error.message // empty' "$resp" 2>/dev/null | head -c 140)
    echo "WARN $1 attempt $attempt HTTP=$code $msg" >&2
    rm -f "$resp"; sleep 6
  done
  echo "FAIL $1.png" >&2; return 1
}

edit() {  # edit <out> <ref> <size> <bg> <quality> <preserve> <prompt>
  local out="$DIR/$1.png" ref="$DIR/$2.png" size="$3" bg="$4" quality="$5" preserve="$6" prompt="$7" b64 bodyf resp code msg refsmall
  # 缩小参考图 + 去换行，body 写文件用 @file 发送（绕开命令行长度限制）
  refsmall=$(mktemp /tmp/refXXXX).png
  sips -Z 640 "$ref" --out "$refsmall" >/dev/null 2>&1 || cp "$ref" "$refsmall"
  b64=$(base64 -i "$refsmall" | tr -d '\n')
  rm -f "$refsmall"
  bodyf=$(mktemp)
  jq -n --arg p "$prompt" --arg s "$size" --arg b "$bg" --arg q "$quality" --arg pr "$preserve" --arg ref "$b64" \
    '{prompt:$p,size:$s,background:$b,quality:$q,preserve:$pr,format:"png",references:[{b64:$ref}]}' > "$bodyf"
  for attempt in 1 2 3; do
    resp=$(mktemp)
    code=$(curl -sS -m 300 -o "$resp" -w '%{http_code}' "$BASE/v1/image/edit" \
      -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" --data-binary "@$bodyf" 2>/dev/null)
    if [ "$code" = "200" ]; then
      jq -r '.images[0].b64' "$resp" | base64 -d > "$out" 2>/dev/null
      if [ -s "$out" ]; then echo "OK   $1.png (edit)  $(wc -c < "$out") bytes"; rm -f "$resp" "$bodyf"; return 0; fi
    fi
    msg=$(jq -r '.error.message // empty' "$resp" 2>/dev/null | head -c 140)
    echo "WARN $1 (edit) attempt $attempt HTTP=$code $msg" >&2
    rm -f "$resp"; sleep 6
  done
  echo "FAIL $1.png (edit)" >&2; rm -f "$bodyf"; return 1
}

PIXAR="Pixar Disney 3D animated movie render, soft cinematic studio lighting, soft global illumination, glossy, vibrant saturated colors, subsurface scattering, ultra clean, high detail"
GREEN="The subject is placed on a completely flat, solid, uniform chroma-key green background, pure RGB 0 255 0 bright green filling the entire frame behind the subject, evenly lit, absolutely no gradient, no vignette, no shadow on the background, and no green light or green reflections on the subject itself."

case "${1:-}" in

westie_run)
  gen westie_run 1024x1024 opaque high \
"Subject: an adorable fluffy West Highland White Terrier (Westie) puppy running fast, full body, side profile facing RIGHT, legs spread in a mid-gallop run cycle (front legs reaching forward, back legs pushing back), ears perked up, mouth open in a happy smile with tongue out, big shiny dark eyes, wearing a small stylish tan crossbody shopping bag.
Style: $PIXAR. Pure white fluffy fur with subsurface scattering, glossy black button nose.
Composition: single character, complete full body fully inside frame with margin all around, facing right, dynamic energetic running pose. $GREEN
Negative: no text, no logo, no watermark, no other scenery, no floor, no drop shadow, only one dog, not cropped." ;;

westie_run2)
  edit westie_run2 westie_run 1024x1024 opaque high \
"fur color and texture, face, eyes, nose, the tan crossbody shopping bag, character identity, the green background" \
"Keep exactly the same Westie character running and facing right, but change ONLY the leg positions to the opposite phase of the gallop: front legs now gathered and tucked under the chest, back legs sweeping forward under the body, as the next frame of a running animation. Same pure white fluffy fur, same face, same tan crossbody bag, same flat solid pure green (RGB 0 255 0) background filling the frame, no shadow." ;;

westie_jump)
  edit westie_jump westie_run 1024x1024 opaque high \
"fur color and texture, face, eyes, nose, the tan crossbody shopping bag, character identity, the green background" \
"Keep exactly the same Westie character facing right, but change the pose to a joyful mid-air JUMP: front paws tucked up toward the chest, back legs extended behind, body arched slightly upward, ears flapping up, eyes bright and excited. Same pure white fluffy fur, same face, same tan crossbody bag, same flat solid pure green (RGB 0 255 0) background filling the entire frame, no shadow." ;;

item_bone)
  gen item_bone 1024x1024 opaque medium \
"Subject: a cute glossy dog bone treat, classic bone shape, warm cream and golden color.
Style: $PIXAR, chunky cartoon game collectible icon, slight rim light, candy-like glossy finish.
Composition: single object centered, slight 3/4 angle, full object inside frame. $GREEN
Negative: no text, no shadow, only one object." ;;

item_bag)
  gen item_bag 1024x1024 opaque medium \
"Subject: a chic little shopping bag with rope handles and tissue paper poking out the top, pastel pink and gold, luxury boutique style.
Style: $PIXAR, glossy game collectible icon, soft rim light.
Composition: single object centered, slight 3/4 angle, full object inside frame. $GREEN
Negative: no readable text, no brand logo, no shadow, only one object." ;;

item_coffee)
  gen item_coffee 1024x1024 opaque medium \
"Subject: a cute takeaway coffee cup with a domed lid and a paw-print sleeve, warm beige and brown.
Style: $PIXAR, glossy chunky game collectible icon, soft rim light.
Composition: single object centered, slight 3/4 angle, full object inside frame. $GREEN
Negative: no readable text, no shadow, only one object." ;;

item_toy)
  gen item_toy 1024x1024 opaque medium \
"Subject: a cute squeaky dog toy shaped like a smiling cartoon duck, bright yellow rubber, glossy.
Style: $PIXAR, chunky game collectible icon, soft rim light.
Composition: single object centered, full object inside frame. $GREEN
Negative: no text, no shadow, only one object." ;;

coin)
  gen coin 1024x1024 opaque medium \
"Subject: a shiny golden reward coin with a cute embossed paw print in the center, thick beveled rim, sparkling.
Style: $PIXAR, glossy metallic game currency icon, bright specular highlight, gold and amber.
Composition: single coin facing the viewer, centered, full object inside frame. $GREEN
Negative: no readable text, no numbers, no shadow, only one coin." ;;

obs_cart)
  gen obs_cart 1024x1024 opaque high \
"Subject: a glossy modern shopping cart (trolley) made of chrome wire with a few colorful gift boxes inside, standing on its wheels, side view facing left.
Style: $PIXAR, chunky stylized game obstacle, polished metal with crisp reflections.
Composition: single cart, full object inside frame with margin. $GREEN
Negative: no text, no shadow, no floor, only one cart." ;;

obs_cone)
  gen obs_cone 1024x1024 opaque medium \
"Subject: a bright orange-and-yellow caution cone sign with a little water-drop symbol, glossy plastic.
Style: $PIXAR, chunky stylized game obstacle, soft rim light.
Composition: single object centered, full object inside frame. $GREEN
Negative: no readable words, no shadow, no floor, only one object." ;;

obs_box)
  gen obs_box 1024x1024 opaque medium \
"Subject: a neat stack of three glossy wrapped gift boxes with ribbons and bows, festive pastel colors, stacked into a small tower.
Style: $PIXAR, chunky stylized game obstacle, soft rim light, glossy ribbons.
Composition: stacked boxes centered, full object inside frame. $GREEN
Negative: no text, no shadow, no floor." ;;

prop_plant)
  gen prop_plant 1024x1024 opaque medium \
"Subject: a tall decorative potted plant, lush green monstera and palm leaves in a glossy modern white ceramic planter, the kind found in a luxury shopping mall.
Style: $PIXAR, clean stylized 3D mall decor prop.
Composition: single potted plant centered, full object inside frame with margin. $GREEN
Negative: no text, no shadow, no floor, only one plant. (Note: the plant leaves are green but darker forest green, the background is pure bright RGB 0 255 0 green, keep them distinct.)" ;;

prop_balloons)
  gen prop_balloons 1024x1024 opaque medium \
"Subject: a cheerful bunch of glossy helium party balloons in pastel pink, gold, peach and cream, tied with curly ribbons, floating festive mall decoration.
Style: $PIXAR, glossy 3D balloons, bright and celebratory.
Composition: balloon bunch centered, full object inside frame. $GREEN
Negative: no text, no shadow, no green balloons, only the balloons." ;;

bg_street)
  gen bg_street 2048x1152 opaque high \
"Subject: a bright sunny OUTDOOR open-air modern lifestyle shopping district (like an upscale open-air mall street block), low and mid-rise contemporary buildings with glass curtain walls and warm wood-slat facades, tree-lined pedestrian street, cheerful boutique storefronts with colorful awnings, leafy green street trees and planters, a clear blue sky with soft fluffy clouds, distant modern architecture skyline, a few hanging festive banners.
Style: $PIXAR, dreamy cheerful animated movie background, bright sunny daylight, soft depth of field with distant blur, warm inviting pastel palette, clean and vibrant.
Composition: wide panoramic establishing shot of the street receding into the distance, deep perspective, the lower third kept open and uncluttered as walkable ground space, no characters, no people.
Negative: no text, no people, no readable brand logos, no harsh shadows, not dark, not indoor, no ceiling." ;;

bg_ground)
  gen bg_ground 2048x768 opaque high \
"Subject: an outdoor open-air shopping street pavement strip seen in slight perspective, warm light-grey granite stone pavers with subtle paneling lines and a tasteful inlaid accent strip, a low planter curb with a hint of greenery along the back edge, sunny soft reflections, clean modern public plaza paving.
Style: $PIXAR, clean stylized animated movie outdoor paving, soft warm sunlight.
Composition: a long horizontal seamless tileable pavement band, even lighting left to right so it can repeat horizontally without a visible seam, viewed from slightly above, no characters.
Negative: no text, no people, no objects, no harsh shadow, no sudden color change at the left or right edges, not indoor, no marble." ;;

title_hero)
  gen title_hero 1024x1280 opaque high \
"Subject: an adorable fluffy West Highland White Terrier (Westie) puppy sitting happily and proudly surrounded by several chic pastel shopping bags, wearing a small tan crossbody bag, big sparkling eyes, tongue out in a joyful smile, in a bright sunny OUTDOOR open-air modern shopping street with stylish low-rise buildings, green street trees and a clear blue sky softly blurred behind.
Style: $PIXAR, heart-warming animated movie poster key art, sunny cinematic rim lighting, warm and inviting, pastel and gold palette, ultra adorable.
Composition: hero portrait, the Westie as the clear centered focal point, soft blurred glamorous open-air street background, generous clean empty space at the very top for a title to be added later.
Negative: no text, no title, no watermark, no readable brand logos, no other animals, no people, not indoor." ;;

icon)
  gen icon 1024x1024 opaque high \
"Subject: a cute app icon of a fluffy West Highland White Terrier (Westie) puppy face smiling with tongue out, big sparkling eyes, centered, on a soft rounded gradient background of warm pastel pink and gold with a subtle sparkle.
Style: $PIXAR, glossy mobile game app icon, bold and adorable, clean and readable at small size, soft inner glow.
Composition: the Westie face fills most of the square frame, centered, friendly, app-icon framing with comfortable margin, full-bleed square background.
Negative: no text, no letters, no watermark, no rounded-corner mask, only one dog face." ;;

list)
  echo "westie_run westie_run2 westie_jump item_bone item_bag item_coffee item_toy coin obs_cart obs_cone obs_box prop_plant prop_balloons bg_street bg_ground title_hero icon" ;;

*) echo "unknown asset: ${1:-<none>}"; exit 1 ;;
esac
