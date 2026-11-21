# Scorebridge · Finale to MusicXML

[Open Scorebridge](https://musicxml.vercel.app). A static, browser-local Finale converter. Choose one or more Finale scores, drop a folder, or use the folder picker to walk a collection. Run **Convert scores**, then download individual MusicXML files or a ZIP with the original folder hierarchy and a text report. **Try a sample score** loads a real single-note Finale 1.0 file.

The score and each linked part are separate MusicXML documents. Settings preserve the document's pitch display, include playback tempos, and retain Finale rest positions. Original fonts are enabled by default. All conversion runs in a dedicated, disposable Web Worker, one input at a time. Additional legacy playback, percussion and font reference tables are fetched from the Denigma maintainer with omitted credentials and verified against pinned checksums. Source scores never leave the browser.

## Cleanup and fidelity

The program parses each exported MusicXML document and checks for score parts. Cleanup removes only attribute-free, semantically empty notation groups. Identical simple articulations attached to the same note are reported by part, measure, and note. Their removal requires an explicit option. Hidden entries, rests, text, cues, voices, tuplets, and other expressive markings are retained by the cleanup pass. Each changed export has a downloadable uncleaned counterpart. Unchanged exports keep the engine's exact bytes.

Denigma is under active development. Damaged, unsupported, or unusually large files can fail individually. Unsupported Finale-specific behavior or layout may differ on import. Retain the original scores. Inspect the report and compare important output with Finale or a reference PDF. The conversion does not infer which valid notes a composer intended to delete.

## Build and host

Use Node 22.12+ or 24 and an unzip utility. Run `npm run build`, then serve `dist/` over HTTP, for example with `python3 -m http.server --directory dist 8000`. Vercel runs the same build and publishes that directory. A static web server is sufficient. No accounts, database, API keys, server functions, or payment services are used.

The build accepts a local verified upstream ZIP at `engine/denigma-wasm.zip` or `DENIGMA_ARCHIVE`. Otherwise it fetches the checksum-verified archive from the deployed app or its original upstream build. [Download the pinned engine ZIP](https://musicxml.vercel.app/vendor/denigma-45c3f626.zip) to build offline. Every deployment carries this exact archive so rebuilding does not depend on GitHub Actions artifact retention. The archive's SHA-256 is `df90c2d1bef67f1aedf85fd65810832feea920ca9c624e34cd0a0b7503a89760`. The build verifies the engine-reported revision and converts genuine test scores before publishing. Run `npm test` to repeat the checks against an existing build.

## Sources

- [Denigma, pinned revision](https://github.com/openmusx/denigma/tree/45c3f6260f26f4d1752e3928013800bee6cc361f) and [upstream WASM build](https://github.com/openmusx/denigma/actions/runs/43738266109).
- [Denigma Online, pinned revision](https://github.com/openmusx/denigma-online/tree/e1de95a5ec1e0f5d9e20aa877839a5fd6a7871ad). The adapted worker, support resource loader, ZIP writer and test fixtures derive from this project. Licenses are in `site/vendor/`.
- [JSZip 3.10.1](https://github.com/Stuk/jszip/tree/v3.10.1) reads the optional legacy support archive.
- The original standalone `dupsize.py` remains independent of this website.
