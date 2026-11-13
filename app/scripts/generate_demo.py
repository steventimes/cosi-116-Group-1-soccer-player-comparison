"""Regenerate the illustrative data used by the local application."""
from pathlib import Path
import json
import random

APP = Path(__file__).resolve().parents[1]
SEASONS = ['2014/15', '2017/18', '2019/20', '2021/22', '2024/25']


def fixture():
    players = []
    for p, label in enumerate(['Player A', 'Player B']):
        profiles = []
        for year, season in enumerate(SEASONS):
            rng = random.Random(116_400 + p * 100 + year)
            passes = 520 + 40 * year + 20 * p
            completed = round(passes * (.76 + .025 * year + .02 * p))
            shots = 36 + 10 * year if p == 0 else 18 + 2 * year
            goals = 3 + 4 * year if p == 0 else 1 + year // 2
            on_target = round(shots * (.34 + .045 * year))
            events = []
            for kind, count in [('pass', passes), ('shot', shots), ('other', 240)]:
                outcomes = list(range(count))
                rng.shuffle(outcomes)
                for i in outcomes:
                    if kind == 'shot':
                        cx, cy, sx, sy = 86, 47 + 3*p, 5, 11
                    elif p == 0:
                        if rng.random() < .7:
                            cx, cy = 48 + 6*year, 18 + 7*year
                        else:
                            cx, cy = 65 + 3*year, 29 + 5*year
                        sx, sy = 9, 9
                    else:
                        cx, cy, sx, sy = 27 + 4*year, 65 - 4*year, 9, 12
                    if kind == 'other':
                        cx -= 7
                        sx += 3
                    event = {'type': kind,
                             'x': round(max(7, min(97, rng.gauss(cx, sx))), 1),
                             'y': round(max(6, min(94, rng.gauss(cy, sy))), 1)}
                    if kind == 'pass':
                        event['complete'] = i < completed
                    elif kind == 'shot':
                        event['goal'] = i < goals
                        event['onTarget'] = i < on_target
                    events.append(event)
            assert goals <= on_target <= shots
            assert sum(e.get('complete', False) for e in events) == completed
            assert sum(e.get('goal', False) for e in events) == goals
            profiles.append({'season': season, 'events': events})
        players.append({'id': str(p), 'name': label, 'profiles': profiles})
    return {'kind': 'illustrative fixture, not observed player records',
            'seasons': SEASONS, 'players': players}


def build():
    data = fixture()
    target = APP / 'data/demo.json'
    target.write_text(json.dumps(data, separators=(',', ':')))
    print(f'Wrote {target.relative_to(APP)} with {len(data["players"])} fictional players.')


if __name__ == '__main__':
    build()
