# SOLMAR HEAT

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Boyoke-Encok/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Boyoke-Encok/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

SOLMAR HEAT is a 2D top-down open-world crime game set in the city of Solmar. You are Rae, a getaway driver working your way up the city's underworld — from small street fares to the score of a lifetime. Every job pays, every job raises the heat, and the police are always one siren away.

## The six jobs

- **First Fare — $400.** Your first job on the streets of Solmar.
- **Hot Wheels — $600.** A faster car, a hotter job.
- **Harbor Run — $800.** Down to the docks and back before the heat catches up.
- **Bank Job — $1,500.** Hold E to crack it open.
- **Kingpin's Errand — $1,200.** Three stops, 180 seconds on the clock.
- **The Big Score — $5,000.** The vault, four guards, and a five-star tail on the way out.

Finish all six jobs — $9,500 in total — to win the game. Get busted by the police or wasted on the street and the run is over.

## The city

- 16 traffic cars driving a real road graph, plus 34 pedestrians on the sidewalks.
- Any car can be stolen — walk up and press E.
- Wanted level 0–5 stars: the higher the heat, the harder the police chase, ram, and try to bust you.
- Health regenerates over time, and medkits are scattered around the city.
- Synthesized WebAudio for engines, sirens, and gunfire — no audio files.
- Minimap, mission tracker, and a localStorage best-take record.

## Controls

On foot: **WASD** move · **Shift** sprint · **Space** shoot · **E** enter car
Driving: **W** gas · **S** brake/reverse · **A/D** steer · **Space** handbrake · **Shift** boost · **E** exit car
**P** pause · **M** job list · **N** mute · **F** free roam · **R** restart

## How to play

Open `game/index.html` in a desktop browser, or run `node serve.ts` and visit http://localhost:8080.

## Tips

- Lose the tail before you go for the vault — five stars on the Big Score is a death sentence.
- Medkits are worth the detour when the heat is up, and a stolen car is always faster than running.

## Tech

Pure canvas rendering with ES modules. No libraries, no network requests, no image or audio assets — every sprite, sound, and street is generated in code.

Built for the make.fun bounty: https://make.fun/bounty/gta6-01
