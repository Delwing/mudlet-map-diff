# 1.5.0
- **stop reporting `rawSpecialExits`.** It is the on-disk encoding of data already reported in readable form: the file stores special exits as `{targetId: ["<lock><command>"]}`, and the reader hydrates that into `mSpecialExits` + `mSpecialExitLocks` and rebuilds it on write (Mudlet itself keeps the packed form only as a local while loading, `TRoom::restore`). Reporting both restated every special-exit edit twice — once as `mSpecialExits."pchnij plyte": 22561 -> 22557` and once as a pair of `rawSpecialExits.<id>.0` lines whose leading `0` is the unlocked flag rather than part of the command.
- upgrade to `mudlet-map-binary-reader` 2.0.0, which keys special-exit locks by command as Mudlet does. Reported lock changes are now the commands that were locked or unlocked, not destination room ids, and a room with two special exits to the same destination no longer reports a lock nobody set.

# 1.4.0
- **stop reporting labels that were only re-encoded.** A label's `pixMap` is a PNG that Mudlet never encodes itself — it hands the QPixmap to QDataStream and Qt's PNG writer emits it — so the bytes carry whatever compression level, IDAT chunk size and ancillary chunks that Qt/libpng build used. Upgrading Mudlet therefore rewrites the PNG of every label nobody touched (observed: `7801` zlib header with 4096-byte IDATs before, `789c` with 8192-byte IDATs plus a pHYs chunk after — same 500x83 RGBA image). `pixMap` changes are now compared by decoded pixels: identical images are dropped, and a label whose only change that was drops out of the report entirely, so nothing renders for it either. Anything that fails to decode is reported rather than swallowed. The CLI says how many were dropped.
- **compare coordinates positionally again.** Array-valued fields are now split by meaning: `rooms` / `zLevels` / `exitLocks` / `stubs` / `mSpecialExitLocks` are id lists and diff as sets, while `pos` / `span` / `size` are fixed-shape tuples and diff by index. Treating a tuple as a set reported a moved label as `pos.added`; sorting one before comparing (the previous behaviour) made a label whose x and y swapped compare *equal* and vanish from the diff. Every other array keeps the original sort-then-compare-by-index behaviour.
- **set-diff id lists**, so adding or removing one room from an area reports that room instead of cascading into an index shift for every element after it (`rooms.added` / `rooms.removed`).
- **upgrade to `mudlet-map-binary-reader` 1.3.0**, which normalises a map the way Mudlet does on load. Together with the above, the diff of two real Arkadia map revisions went from 823 rooms + 43 labels to 73 rooms + 1 label — everything dropped was an artifact of a Mudlet upgrade, not an edit. The reader is ESM/browser-pure now, so maps are read with `readMapFromBuffer(readFileSync(path))` and its types come from the package root.

# 1.3.0
- add `--debug-raw` to write the renderer's SVGs before composition, for debugging the composed output
- reuse renderer instances through a `MapRenderSession` instead of building one per image, and generate SVGs from those shared sessions
- CLI reports a diff summary and per-image progress; `exportDiff` returns the rendered images so the HTML report can reuse them
- upgrade `mudlet-map-renderer`, `listr2` and other dependencies

# 1.2.0
- render inline on the main thread instead of in worker threads. Each worker received a full deep clone of both maps through `workerData`, so memory scaled with CPU count and a large map on a many-core runner was killed by the OOM reaper. One copy of each map is now held in total; `render-worker.ts` is gone.

# 1.1.0
- destroy canvases once rendered, so a long run does not accumulate them

# 1.0.0
- rewrite project to TypeScript
- introduce new unified diff model with `EntityDiff` and `PropertyDiff`
- add support for area and map-level property diffing
- compare labels using `labelId` within the same area
- include `pixMap` (Buffer) in diffs

# 0.2.1
- remove accidentally left resolve() causing failure

# 0.2.0
- svgs will have their width and height removed so, they will take up 100% of available space

# 0.1.0
- initial release
