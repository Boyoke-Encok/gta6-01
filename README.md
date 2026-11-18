# SOLMAR HEAT

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Boyoke-Encok/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Boyoke-Encok/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

A 2D top-down open-world crime game set in the city of Solmar. Play Rae, a
getaway driver working six jobs across downtown, the beachfront, the harbor
and the suburbs — while the heat closes in.

## Play

Open `game/index.html` in a desktop browser, or serve the folder with
`node serve.ts` and visit http://localhost:8080.

- **On foot:** WASD move, Shift sprint, Space shoot, E enter a car
- **Driving:** W/S gas & brake, A/D steer, Space handbrake, Shift boost, E exit
- **Keys:** P pause · M job list · N mute · F free roam · R restart

## The six jobs

1. **First Fare** — $400 · pick up a client, drop them at the hotel
2. **Hot Wheels** — $600 · steal the gold coupe, deliver it to the chop shop
3. **Harbor Run** — $800 · run a package from the pier to downtown
4. **Bank Job** — $1,500 · crack the safe (hold E), then shake the heat
5. **Kingpin's Errand** — $1,200 · three stops in three minutes
6. **The Big Score** — $5,000 · the vault, four guards, a five-star tail

Finish all six ($9,500) to win. Get busted or wasted and the run ends.

## Systems

- A living city: 16 traffic cars on a road graph, 34 pedestrians, stealable cars
- Wanted level 0–5 stars: crimes raise it, laying low drops it; police chase,
  ram and bust
- Health with regen and medkit pickups, cash pickups, synthesized WebAudio
  (engine hum, sirens, gunfire, a bassline) — no audio files
- Minimap, mission tracker with timer, toasts, localStorage best take

## Tech

Pure canvas + ES modules, no libraries, no network requests, all art drawn
in code. `game/js/` is split by job: `util` helpers, `city` map and roads,
`audio` synth, `input` keys, `entities` actors, `missions` the six jobs,
`render` drawing and HUD, `main` loop and state.

Entry for the [make.fun bounty page](https://make.fun/bounty/gta6-01).
