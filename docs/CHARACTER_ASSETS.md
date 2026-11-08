# 角色素材生成记录

采用内置图像生成，透明背景。原图已原样保存到 assets/resources/characters/hero-atlas.png 与 enemy-atlas.png；没有重采样、改色或去背。

## 玩家提示词

Use case: stylized-concept. Asset type: production transparent PNG sprite atlas for a Cocos Creator 2D ragdoll archery game. Create ONE square 4 by 4 uniform-cell atlas, ideally 2048x2048, each of 16 cells exactly same size. Real transparent background, no grid, no lettering, no shadows outside objects. Each separate body piece centered in its own cell, with at least 16% empty padding inside each cell; NO assembled person, NO connected pieces. Original clean stylized round-headed faceless archer inspired by minimalist stick-figure physics archers. Ivory smooth round head, compact light teal tunic with small amber belt, ivory limbs with restrained teal bracers/boots. Flat side-on orthographic game art, two shades at most, crisp dark blue outline, readable at tiny size, elegant simple silhouette; no face, hair, armor bulk, fingers, glow, lighting effects or texture noise. All limb pieces long axis VERTICAL, attachment endpoints centered, rounded ends; no projecting hands or feet. Use these exact cell contents in row-major order:
row1: round ivory head; teal chest tunic (width:height 0.48:0.65); compact teal pelvis/belt (0.42:0.34); ivory left upper arm (0.20:0.40).
row2: ivory left forearm with thin teal wrist band (0.18:0.38); ivory right upper arm (0.20:0.40); ivory right forearm with thin teal wrist band (0.18:0.38); ivory left thigh (0.22:0.56).
row3: ivory left shin with simple teal lower cuff (0.20:0.58); ivory right thigh (0.22:0.56); ivory right shin with simple teal lower cuff (0.20:0.58); wooden amber bow facing RIGHT (vertical crescent, grip middle, NO string).
row4: normal amber arrow pointing RIGHT horizontally; red broadhead impact arrow pointing RIGHT horizontally; violet steel piercing arrow pointing RIGHT horizontally; separate simple small slate and amber helmet cap, no face, centered.
IMPORTANT atlas cells must not contain extra pieces, labels or mini compositions. For head keep perfectly circular. Body parts must look like simple rounded rigid-body cutouts, NOT realistic anatomy. Body cells use 64% of cell height (pelvis 45%, head 60%); no object crosses its cell boundary.

## 敌人提示词

Use case: stylized-concept. Asset type: production transparent PNG sprite atlas for a Cocos Creator 2D ragdoll archery game. Create ONE square 4 by 4 uniform-cell atlas, ideally 2048x2048, each of 16 cells exactly same size. Real transparent background, no grid, no lettering, no shadows outside objects. Each separate body piece centered in its own cell, with at least 16% empty padding inside each cell; NO assembled person, NO connected pieces. Original clean stylized round-headed faceless archer inspired by minimalist stick-figure physics archers. Pale ivory smooth round head, compact warm coral-red tunic with small amber belt, ivory limbs with restrained coral-red bracers/boots. Flat side-on orthographic game art, two shades at most, crisp dark blue outline, readable at tiny size, elegant simple silhouette; no face, hair, armor bulk, fingers, glow, lighting effects or texture noise. All limb pieces long axis VERTICAL, attachment endpoints centered, rounded ends; no projecting hands or feet. Use these exact cell contents in row-major order:
row1: round ivory head; coral-red chest tunic (width:height 0.48:0.65); compact coral-red pelvis/belt (0.42:0.34); ivory left upper arm (0.20:0.40).
row2: ivory left forearm with thin coral-red wrist band (0.18:0.38); ivory right upper arm (0.20:0.40); ivory right forearm with thin coral-red wrist band (0.18:0.38); ivory left thigh (0.22:0.56).
row3: ivory left shin with simple coral-red lower cuff (0.20:0.58); ivory right thigh (0.22:0.56); ivory right shin with simple coral-red lower cuff (0.20:0.58); wooden amber bow facing RIGHT (vertical crescent, grip middle, NO string).
row4: normal amber arrow pointing RIGHT horizontally; red broadhead impact arrow pointing RIGHT horizontally; violet steel piercing arrow pointing RIGHT horizontally; separate simple small slate and amber helmet cap, no face, centered.
IMPORTANT atlas cells must not contain extra pieces, labels or mini compositions. For head keep perfectly circular. Body parts must look like simple rounded rigid-body cutouts, NOT realistic anatomy. Body cells use 64% of cell height (pelvis 45%, head 60%); no object crosses its cell boundary.

## 使用

见 assets/resources/characters/README.md。CharacterSkin 已接入 PhysicsLab；只显示 11 个身体片，其余 5 个装备片暂不替换运行表现。现有刚体、关节和真实握点不变。资源导入及 SpriteFrame 使用依据 Cocos 3.8 官方文档：https://docs.cocos.com/creator/3.8/manual/en/asset/sprite-frame.html 与 https://docs.cocos.com/creator/3.8/manual/en/asset/texture.html 。本环境缺 Creator，未宣称编译或运行通过。

