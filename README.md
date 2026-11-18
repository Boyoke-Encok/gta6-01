# Azura Bay — Getaway

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Boyoke-Encok/gta6-01/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Boyoke-Encok/gta6-01/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the [make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01): a sun-soaked coastal city to explore on foot and by car, built entirely from code — no borrowed art, music, names or maps.

## The game

**Azura Bay** is a vibrant seaside city: a dense downtown of colorful towers, a beachfront with palms and umbrellas, a working harbor full of containers and cranes, quiet suburbs, and a highway ring. You are **Milo Reyes**, getaway driver for Vera's crew.

- **Explore on foot and by car** — sprint, steal any traffic car (E), drive with boost and handbrake drifts
- **Living traffic** — 16 cars obeying traffic lights, 34 pedestrians who flee from gunfire
- **Wanted level 0–5** — police cars chase and ram you, foot cops close in; get busted if they box you in
- **Six story missions** — First Fare, Hot Wheels, Harbor Run, Bank Job, Kingpin's Errand, and The Big Score ($9,500 total)
- **Combat** — mouse-aimed pistol, armed guards, health + medkits, explosions
- **HUD + minimap** — wanted stars, cash, health, boost meter, mission tracker with timers, live minimap
- **Save** — best score and cash persist in localStorage; free-roam mode (F) when you just want the city
- **Sound** — fully synthesized WebAudio: engine hum, sirens, gunshots, and a synthwave bassline (N to mute)

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot / drive |
| Mouse | Aim (on foot) |
| Space | Shoot (on foot) / handbrake (in car) |
| E | Enter, exit or steal a car / hold to crack safes |
| Shift | Sprint / boost |
| P | Pause · M missions · F free roam · N mute · R restart |

## Play it

```sh
node serve.ts
# open http://localhost:8080
```

## Tips

- Stealing a car in front of witnesses raises your wanted level — steal quietly.
- Wanted stars cool off after 10 clean seconds, one star every 8 seconds.
- The red Comet at the Marina is the fastest car in the city.
- Hold E at the bank vault and the Meridian vault — but watch for guards.

## License

MIT — see [LICENSE](LICENSE).
