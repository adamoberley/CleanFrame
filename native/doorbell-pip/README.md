# Doorbell picture-in-picture

A small native program for a rooted Samsung Tizen TV that shows a camera over whatever is on screen,
for example the front door when the doorbell rings. CleanFrame itself is a web app and cannot draw over
other apps, so this uses an EFL notification-level window, as Vetro's launcher does (window setup adapted
from Vetro, MIT, Copyright (c) 2026 Vetro contributors).

- Reads a go2rtc MJPEG stream on a background thread and shows the newest frame a few times a second.
- Appears only once it has a picture, in the top-right corner, inside a rounded frosted rim
  (`res/frame.png`, `res/mask.png`, made by `scripts/build-pip-art.mjs`).
- Takes the remote while it shows: any key (Back, OK or an arrow) closes it and the app underneath
  gets the remote back. Otherwise it closes after `--seconds` or when its `--stop` file appears.

## How it is started

The CleanFrame Vetro bridge (`vetro/cleanframe-art`) carries the build base64-encoded and unpacks it
to `pip/` beside its config. `pip/` and `pip/res` get the same checks as the art cache (created
0700, never a symlink or another user's, canonical path) and the files are written 0600; the bridge
records each file's sha256 as it unpacks. With `pip.stream` set in the bridge config, the bridge
subscribes to `vetro/cleanframe/doorbell` on the MQTT broker Vetro is configured for (reusing Vetro's
saved login, with its own client id) once its HTTP listener is up, and retries every 60 s while the
settings are missing or MQTT is off. `ring` starts the overlay as root with
`systemd-run --unit=cleanframe-pip`, but only after the root command re-checks every file against the
recorded hashes (`sha256sum`, or `openssl dgst -sha256` if that is missing); on any mismatch nothing
runs and the bridge status shows `PiP start failed`. `clear` closes it early. Retained messages are
ignored, and a malformed packet just drops the connection, which reconnects after 10 s.

```json
{ "pip": { "stream": "http://192.168.1.2:1984/api/stream.mjpeg?src=doorbell_sub", "seconds": 30 } }
```

## Build

`npm run build:pip` (needs a .NET SDK; targets the TV's .NET 6 runtime), then `npm run pack:art`.
Without a build the bridge works as before and simply has no PiP to start.
