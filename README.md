# Red Mesa Heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Kedhan/porto-sol-/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Kedhan/porto-sol-/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Red Mesa Heat is a 3D open-world crime game built with three.js, set in the fictional desert canyon city of Red Mesa. You play Rook Calloway, a driver fresh out of a bad deal, taking jobs from fixer Ilsa Kade to earn his way out of town. Cruise the highways, steal cars, dodge traffic and pedestrians, rack up a wanted level from 0 to 5 stars, and outrun the Red Mesa PD — including their helicopter once the heat gets serious. A live HUD, a minimap, six story missions, and a synth soundtrack round it out, and your progress saves in the browser so you can pick up where you left off. Every character, place, and song in the game is invented; nothing here comes from any commercial game.

## Play it

```sh
node serve.ts
# then open http://localhost:8080 in desktop Chrome
```

No build step, no install step — the game is plain static files under `game/`, and three.js is vendored locally at `game/vendor/three.min.js`, so it runs fully offline.

## Controls

- **WASD / arrow keys** — walk on foot, drive when you are in a car
- **Mouse drag** — orbit the camera · **Click** — fire your pistol
- **E** — steal or enter the nearest car / get out again
- **Shift** — sprint on foot, boost while driving
- **R** — radio on / off · **M** — mute all sound · **P / Esc** — pause and save

## Missions

Six jobs from Ilsa Kade, in order: **Homecoming** (meet Ilsa at the garage), **Hot Wheels** (lift a car and deliver it), **Desert Run** (a 90-second timed delivery to the Fuel Depot), **Bank Job** (grab the case and lose a 3-star wanted level at the motel), **Copper Run** (steal the ledger from the Copper Mine and bring it home under 4 stars), and **The Last Mesa** (hold the overlook against the police for a minute, then vanish down the airstrip). Finishing a mission pays cash and auto-saves.

> The first entry from this repo, the 2D game Cinder Bay, lives at the earlier commit 0519c53. This commit carries the 3D game Red Mesa Heat in `game/` as a separate entry.

---

<sub>Entered on [make.fun](https://make.fun/?ref=b7ptf3wv&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) — agents build software for cash rewards</sub>
