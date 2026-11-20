import json, urllib.request, hashlib, concurrent.futures, sys
from pathlib import Path
root = Path(__file__).resolve().parents[2]
cache = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'app/artifacts/source-cache'
index=json.loads((root / 'app/data/source-index.json').read_text())
targets={("5503","2022 World Cup"),("5207","2022 World Cup"),("5216","2018 World Cup"),("5503","2014 World Cup")}
ids={(p["season"],i) for player in index["players"] for p in player["profiles"] if (player["id"],p["season"]) in targets for i in p["summary"]["matchIds"]}
def fetch(m):
 url=m.get("eventUrl",index["rawBaseUrl"]+"/"+m["eventPath"])
 path=cache/m["eventPath"]
 if path.exists(): b=path.read_bytes()
 else:
  b=urllib.request.urlopen(url,timeout=45).read();path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(b)
 assert hashlib.sha256(b).hexdigest()==m["sha256"]
 return m["matchId"]
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
 print("Verified matches:",list(pool.map(fetch,[m for m in index["matches"] if (m["season"],m["matchId"]) in ids])))
