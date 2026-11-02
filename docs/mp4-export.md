# Local MP4 export

Start the app and its native export worker in separate terminals:

```sh
npm run dev
npm run export:server
```

Export Current Scene renders the selected Story scene; Export All Scenes joins the ordered scenes at their configured durations. Output is H.264 MP4 at 1920×1080, 60 fps. FFmpeg (with `libx264` or `libopenh264`) and FFprobe must be installed and available on `PATH`; override with `FFMPEG_PATH` / `FFPROBE_PATH` if needed.
