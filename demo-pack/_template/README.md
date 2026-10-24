# Demo pack template

Every app package ships a demo pack in `demo-pack/<app>/`. It is the input to the
`product-demo-recording` skill and must describe a demo of the real running app.

## Files

- `STORYBOARD.md`: who watches, what they should believe afterwards, target length,
  then one section per scene in the order it is recorded.
- `pack.json`:

| Field | Meaning |
|---|---|
| `app` | Pack name, same as the folder |
| `audience` | Who watches the demo |
| `outcome` | What the viewer should believe afterwards |
| `run.command` | Command that starts the app for recording |
| `run.url` | First URL the recorder opens |
| `data.source` | File that provides the deterministic demo data |
| `data.synthetic` / `data.recorded` | One of them `true`: synthetic data, or a recorded real run on public data; the app labels it on screen |
| `scenes[]` | `id`, `route`, `action`, `proof`, `caption` for each scene |

## Rules (checked by `__tests__/lib/demo-pack.test.ts` and `demo-packs.test.ts`)

- Complete: both files present, every field filled.
- No placeholder text anywhere.
- Every scene route has a page in `app/`.
- Real app on labelled data only (synthetic, or a recorded real run on public data): no mock screens, no edited screenshots.
