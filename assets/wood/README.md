# Wood PBR textures (CC0)

Photoreal seamless wood texture sets used by `src/wood-photo.js`.

## Source & license

All assets are from **ambientCG** (https://ambientcg.com) and are released into
the **public domain under the Creative Commons CC0 1.0 license**
(https://creativecommons.org/publicdomain/zero/1.0/). No attribution required;
attribution included here as courtesy.

Downloaded as the `<AssetID>_1K-JPG.zip` packages; only the Color, NormalGL, and
Roughness maps were kept (renamed to `color.jpg`, `normal.jpg`, `roughness.jpg`).
All maps are 1024x1024 JPEG, seamless/tileable.

## Assets

| Folder        | ambientCG ID | Reads as                         | Used for (stock)                |
|---------------|--------------|----------------------------------|---------------------------------|
| `oak-planed`  | **Wood062**  | Warm planed oak/timber           | Default; `reglar34x45/45x45/45x70` |
| `pine-planed` | **Wood066**  | Lighter, smoother planed pine    | Sheet goods `ply12/15/18/21`    |
| `plank-floor` | **Planks011**| Plank/floorboard with seams      | Chunky `reglar45x95/45x120`     |

Each folder contains:

```
color.jpg      — albedo (sRGB)
normal.jpg     — NormalGL (OpenGL-style normal map, linear)
roughness.jpg  — roughness (linear, single channel)
```

## stock -> texture-set mapping (see `setKeyForStock` in `src/wood-photo.js`)

- `ply*` / sheet  -> `pine-planed`
- `reglar*` with 95 or 120 section -> `plank-floor`
- other `reglar*`  -> `oak-planed`
- unknown          -> `oak-planed`

The material tints slightly toward `opts.baseColor` so each stock keeps its
character while the photo texture supplies the detail. Grain runs along
`opts.longAxis`; repeat is derived from `opts.sizeMM` for ~constant real-world
scale (~600 mm of timber per Color tile, 700 mm for the plank set).
