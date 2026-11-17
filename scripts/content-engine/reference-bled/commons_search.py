import json, sys, urllib.request, urllib.parse, re, html
UA={"User-Agent":"town-page-preview/0.1 (local build script)"}
def search(q, n=20, width=1280):
    url="https://commons.wikimedia.org/w/api.php?"+urllib.parse.urlencode({"action":"query","generator":"search","gsrsearch":q,"gsrnamespace":6,"gsrlimit":n,"prop":"imageinfo","iiprop":"url|size|extmetadata","iiurlwidth":width,"format":"json"})
    d=json.load(urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=40))
    out=[]
    for p in sorted(d.get("query",{}).get("pages",{}).values(), key=lambda p:p.get("index",0)):
        ii=(p.get("imageinfo") or [None])[0]
        if not ii: continue
        em=ii.get("extmetadata",{}); g=lambda k: em.get(k,{}).get("value")
        strip=lambda s: re.sub(r"\s+"," ",html.unescape(re.sub(r"<[^>]+>","",s or ""))).strip()
        out.append({"title":p["title"],"w":ii["width"],"h":ii["height"],"thumb":ii.get("thumburl"),"page":ii.get("descriptionurl"),"licence":g("LicenseShortName"),"licence_url":g("LicenseUrl"),"author":strip(g("Artist"))[:80],"date":strip(g("DateTimeOriginal"))[:20]})
    return out
if __name__=="__main__":
    for r in search(sys.argv[1], int(sys.argv[2]) if len(sys.argv)>2 else 20):
        print(f"{r['w']}x{r['h']} | {r['licence']} | {r['author'][:30]} | {r['date'][:10]} | {r['title']}")
