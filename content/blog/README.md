# The Zyflow Journal: playbook

**v1.0, 2026-10-27.** How to plan, write and publish a post on zyflow.eu/blog. Brand rules come from `design-system/docs/brand-guidelines.md` (v2.0); this file applies them to the journal. If the two disagree, the brand guidelines win.

Quick start:

```bash
npm run blog:new -- my-post-slug --type practical   # scaffold content/blog/my-post-slug/en.md
npm run blog:check                                  # validate every post + journal lint
npm run blog:pull -- my-post-slug                   # copy photos from the Drive folder
npm run blog:preview                                # build with drafts shown, then: npm run serve:rebuild
```

---

## 1. What the journal is for

Zyflow is a guidebook for cyclists about where they are: a place guide, not a route app. The journal is the long-form part of that guidebook. A post earns its place by doing at least one of these jobs:

1. **Answer a search a rider makes before a ride.** "Where to charge an e-bike in Bled", "bike-friendly stays Jezersko", "Ljubelj pass by bike". This is the main job and the reason the engine emits Article, FAQ, Breadcrumb and ItemList schema.
2. **Show local knowledge the map cannot.** Which café has a socket by the door, where the climb really starts, which border road is quiet on Sunday.
3. **Send the rider to the app** with a reason: plan the battery, see the places on the map, ride this route.
4. **Make bike-friendly places visible.** Every place named is a potential partner (Zyflow for Businesses). Write about them the way a guidebook would, never as an advert.

A post that does none of these is not written.

**Reader.** E-bike riders and touring, road and gravel cyclists planning a day or a weekend in Slovenia and across its borders. Mostly visitors, often in English; locals in Slovenian. Secondary reader: café, restaurant and stay owners who want riders.

**Positioning in one line:** *Know where to stop.* Other sites tell you where to ride; the journal tells you where to stop, charge, eat and sleep on the way, and how to finish the ride.

---

## 2. Pillars

Every post belongs to one pillar. The pillar is a planning label, not a field. The `type` field is what the site shows.

| Pillar | What it covers | Usual `type` | Example |
| --- | --- | --- | --- |
| **Where to stop** | Cafés, restaurants, stays, chargers, water and repair in one area, each with the reason it is bike-friendly | `spot-list` | "Five charging stops around Bled" |
| **Ride it** | One featured route or a weekend: the line, the climbs, the stops, the season | `route-guide`, `itinerary` | "Prelaz Ljubelj by e-bike" |
| **Ride smarter** | Battery, elevation, weather, borders, luggage: planning skills, always ending in a Zyflow habit | `practical` | "Reading elevation before a cross-border ride" |
| **Bike-friendly places** | Hosts and places, what makes a place bike-friendly, and news from Zyflow | `story` | "What makes a place bike-friendly?" |

**Mix:** in every four posts, two Where to stop or Ride it, one Ride smarter, one Bike-friendly places. Local, findable posts first; opinion last.

### How the journal is organised

Two axes. **Where** is a tree of hub posts; **what kind** is a set of filters.

**Where: country › region › area.** This is what riders search ("cycling Slovenia", "e-bike Bled"), so each level has one hub post that introduces it and lists what sits under it ("In this guide"). The places live in `_taxonomy.yml`:

```
Slovenia   Gorenjska · Central Slovenia · Primorska · Notranjska · Štajerska · Koroška · Dolenjska · Pomurje
Austria    Carinthia · Styria · Tyrol · Salzburg region
Italy      Friuli Venezia Giulia · Veneto · Trentino-South Tyrol
Croatia    Istria · Kvarner · Gorski kotar · Zagreb and around · Lika · Dalmatia
```

Each region lists its areas (Gorenjska: Bled, Bohinj, Kranjska Gora, Radovljica, Tržič, Jezersko, Kranj; Carinthia: Klagenfurt, Wörthersee, Villach, Faaker See, Ferlach, Nockberge; Istria: Rovinj, Poreč, Motovun, Pula; and so on). Every place has an English and a Slovenian name (Klagenfurt / Celovec, Trieste / Trst). Ids are unique across the file, so `carinthia` (Austria) and `koroska` (Slovenia) never mix; the build fails on a duplicate.

The map is bigger than the journal on purpose: a place appears on /blog (Explore line, filters) only once a post uses it, so an empty region never shows. A post names its `region` (and `area`); its `country` is filled in from the region. To add a place, add it under its region with both labels, then `npm run test:rebuild`.

**Tips are not a place.** Battery, elevation, weather and borders work anywhere, so practical posts carry no region and hang under the **Ride smarter** pillar hub (`ride-smarter`). Stories may also have no region. Route guides, spot lists and itineraries always need one.

**Hub levels** (`hubLevel`, with `parentHub` pointing one or more levels up):

| Level | When | Example | parentHub |
| --- | --- | --- | --- |
| `pillar` | A topic that is not a place | Ride smarter | `blog` |
| `country` | Once a country has two or more regions with posts | Cycling in Slovenia | `blog` |
| `region` | One per region in the taxonomy | Cycling in Gorenjska | the country hub, or `blog` |
| `area` | Once an area has three or more guides | Bled by bike | the region hub |
| `guide` | Every other post | Charging stops around Bled | the area or region hub, or `ride-smarter` |

/blog features the newest pillar, country or region hub, and its Explore line lists Ride smarter, then each country, region and area that has posts, linked when a hub exists. **Write "Cycling in Gorenjska" first.**

**What kind: filters on /blog.** Visitors filter by **Region**, **Type**, **Activity** and **Topic** (the `tags`). A **Country** row appears once posts cover two countries. Each row shows only the values some post uses, so no button leads to an empty list. Filters are also links (`/blog?region=gorenjska&topic=charging`), so you can share them.

**Tags are topics that cut across places.** Give each post 1–3 (5 at most). They drive the Topic filter and "Related stories". The Topic filter lists them in this order. Each tag's `use` line in `_taxonomy.yml` says when it applies.

| Group | Tags (id) | Use for |
| --- | --- | --- |
| Stops: what you find on the way | `cafes`, `food`, `stays`, `huts`, `charging`, `water`, `repairs`, `viewpoints`, `wine` | Spot lists and route guides. At least one stop tag on every spot list |
| Riding: what the route is like | `climbs`, `cycle-paths`, `quiet-roads`, `family`, `first-rides` | Route guides and itineraries |
| Planning: what to know before | `planning`, `range`, `borders`, `trains`, `weather`, `safety`, `gear` | Ride smarter tips; `borders` on every ride that crosses one |

Pick the most specific tag: `range` for how far a battery goes, `charging` for where to plug in. Do not tag what the region or activity already says (no "slovenia" or "e-bike" tags). Propose a new tag only when three posts will use it; add it to the right group with both labels and a `use` line.

---

## 3. Voice

From brand guidelines §8, applied to long form:

- **Plain, second person, sentence case.** "Set your range the way you really ride", not "Unlock Your E-Bike's Full Potential!".
- **Titles are 7 words or fewer.** The site sets them in Tanker caps; long titles turn into a wall. State the claim or the place: "Charging stops around Bled", not "Everything you need to know about charging".
- **The description (meta) is one sentence, at most 160 characters**, ending in a full stop. It is also the lede under the title, so it has to read as a sentence a person would say.
- **Headings (`##`) are short and concrete,** 7 words or fewer, written in sentence case in the Markdown. The site sets them in caps.
- **Reasons are visible.** Say why a place is on the list: "socket by the terrace · ask at the bar", "covered parking for 10 bikes". If you have not checked it, say "not confirmed yet".
- **Numbers carry the page.** Distances, climbs, opening months, charger types. Only numbers that are true today (brand §13). No "best ever", no "hidden gems", no "amazing".
- **No emoji, no exclamation marks, no hashtags** in the body.
- **Slovenian** uses the informal *ti*, the same plainness, and is written, not translated. Its slug, title and description must differ from English (the build checks this).

Banned words (the linter warns): amazing, stunning, breathtaking, hidden gem, must-see, ultimate, unlock, discover (as a headline verb), journey (for a ride), paradise.

---

## 4. Anatomy of a post

Every post renders the same page. The parts in **bold** you write; the rest the engine builds.

1. Hero photo (full width, credit under it)
2. Breadcrumbs (from the hub chain)
3. Meta line in mono: type · region (or country; nothing for a tip) · date · updated · reading time
4. **Title** (`title`)
5. **Lede** (`description`)
6. **Data strip** (`facts`): the brand's mono strip, e.g. `26 KM · 900 M · INTERMEDIATE · APR–OCT`
7. **Body** (Markdown + blocks below)
8. How we made this (`howWeMade`, required if `aiAssisted: true`)
9. Author box
10. Related routes (`relatedTours`), related stories (`relatedPosts`), "In this guide" (children)
11. App CTA

**Length:** practical and story 600–1,000 words; spot-list and route-guide 900–1,500; region and country hubs 1,200–2,000; the Ride smarter pillar 400–800.

### Skeleton by type

**`spot-list`: Where to stop.** Intro (2–3 sentences: area, who it is for, how we chose). Then one `##` per place: name as heading, a mono-style first line of facts written as plain text ("Café · 1.2 km from the lake · socket by the door"), 2–4 sentences on why, and how to find it in Zyflow. Close with a `:::faq` (2–4 questions people search) and `:::app-cta`.

**`route-guide`: Ride it.** Intro (the ride in one paragraph with its numbers). `## Before you go` (season, bike, battery, water). `## The ride` in 3–5 sections by stretch, each with the climb and the stop. `## Where to stop` (3–5 places with reasons). `:::tour-cards <slug>` for the featured route. `:::faq`. Facts must include `distanceKm`, `climbM`, `difficulty`, `bestSeason`.

**`itinerary`: weekend.** Like route-guide, split by day (`## Day 1: …`), with `sleep` in facts.

**`practical`: Ride smarter.** Problem in the first paragraph. 3–5 `##` steps, each ending in what to do. One pull quote (`>`) for the line worth sharing. End with the Zyflow habit that solves it, then `:::app-cta`.

**`story`: Bike-friendly places.** A place, a host or a change in Zyflow. Open on a concrete scene, not a claim. Quote only real people, with their name (brand §13).

---

## 5. Front matter reference

Copy `_template/en.md`, or run `npm run blog:new`. All fields, with the rules the build enforces:

| Field | Required | Rule |
| --- | --- | --- |
| `status` | yes | `draft` (validated, never built) or `published` |
| `translationKey` | yes | kebab-case, equals the folder name, same in `en.md` and `sl.md` |
| `slug` | yes | kebab-case URL; differs between `en` and `sl`; not `author` or `rss` |
| `title` | yes | ≤ 7 words (lint), no `{{tokens}}` |
| `description` | yes | ≤ 160 characters, ends with a full stop |
| `datePublished` / `dateUpdated` | yes | `YYYY-MM-DD`; not in the future when published; updated ≥ published |
| `author` | yes | a file in `_authors/`; never AI or a bot |
| `type` | yes | `route-guide`, `spot-list`, `itinerary`, `practical`, `story` |
| `hubLevel` | yes | `pillar`, `country`, `region`, `area`, `guide` (§2) |
| `parentHub` | yes | `blog` or the `translationKey` of a higher hub |
| `region` / `area` | for route-guide, spot-list, itinerary, region and area hubs | ids from `_taxonomy.yml`; leave out for tips |
| `country` | for a country hub | id from `_taxonomy.yml`; otherwise filled in from the region |
| `activities` | yes | 1+ of `road`, `gravel`, `mtb`, `e-bike`, `ev` |
| `tags` | recommended | 1–3 (max 5) ids from `_taxonomy.yml`; they are the Topic filter |
| `hero` | yes | `src` under `images/`, `alt`, `credit`, `licence` (see §7) |
| `facts` | when published | route-guide and itinerary: `distanceKm`, `climbM`, `difficulty`, `bestSeason`; others: `bestSeason` or `charge`. Optional: `eat`, `sleep`, `charge` |
| `sources` | when published | 1+ `{kind, note}`; kind is `ridden`, `own-gpx`, `own-photos`, `notes`, `partner`, `municipality`, `app-data` |
| `relatedTours` | no | slugs of featured routes |
| `relatedPosts` | no | translationKeys in the same language |
| `aiAssisted` | yes | `true` or `false`; if `true`, `howWeMade` is required |
| `howWeMade` | if AI | one plain sentence: "Ridden by Jakob, drafted with AI help from his notes, checked by Jakob." |
| `ogImage` | no | file under the post folder; otherwise the hero is used |

---

## 6. Body blocks

Markdown is GitHub-flavoured. Raw HTML, bare images and `{{tokens}}` fail the build. Links may be `http(s)`, `mailto`, `#anchors` or relative.

```md
:::figure src="images/cafe.jpg" alt="Bikes parked by a café terrace" credit="Zyflow" licence="own"
Covered parking for ten bikes, a socket by the door.
:::

:::facts
:::                      ← moves the data strip to this spot in the body

:::faq
### Can I charge an e-bike at the café?
Yes. Ask at the bar; the socket is by the terrace door.
### Is there secure parking?
Covered racks, not locked. Bring your lock.
:::

:::tour-cards blejcanka k35-prelaz-ljubelj
:::

:::app-cta
:::
```

`:::route-map tour="…"` is reserved and fails the build until the map block ships.

---

## 7. Photos

Brand §7, applied:

- **Subject:** real roads and real places, Slovenian where possible; the rider from behind or small in the frame. **No faces, no cars, no stock smiles, no logos.** A café shot shows the bikes, the socket or the terrace, not people eating.
- **Light:** early or late, natural colour, never orange-graded.
- **Hero:** landscape, at least 1600 px wide, JPG under 400 KB (the build makes AVIF/WebP). The subject sits in the middle 60% because the crop changes per screen.
- **Figures:** one every 300–400 words in spot-lists and route-guides; zero or one in practical posts.
- **Licences:** `own` (ours) · `partner-permission` (credit ends "(used with permission)", plus `permissionRef`) · `guest-rider` (`rightsConfirmed: true`) · `cc-by-4.0`, `cc-by-sa-4.0`, `cc0` (credit includes "via Wikimedia Commons", plus `sourceUrl`).
- `alt` describes what is in the picture for someone who cannot see it. It is not a caption and not keywords.

---

## 8. SEO

- **One search per post.** Write the query in the brief. Put the place name in the title, the description, the slug and the first paragraph.
- **Slug:** 3–6 words, no dates, no stop words ("charging-stops-bled", not "where-to-charge-your-e-bike-in-bled-2026").
- **FAQ:** 2–4 real questions people type. They become FAQ schema.
- **Links:** 2+ internal links (a featured route, another post, /business for owners), and link out to official sources (municipality, tourist board) where it helps the reader.
- **Freshness:** when you re-check a post, change `dateUpdated`. Spot-lists get re-checked every spring.
- Titles and descriptions are checked by the same rules as every page (`page-meta.js`).

---

## 9. Workflow

**Material lives in Google Drive:** Zyflow › **Zyflow Journal**. It has `01 Inbox`, `02 Posts/<slug>` (`hero.jpg`, photos, a `notes` doc, GPX), `03 Photo library/<Country>/<Region>` (plus General), `04 Partner permissions` and a **Photo credits** sheet. Its "00 Read me first" doc tells managers what to upload. `npm run blog:pull -- <slug>` copies a post's photos from the synced Drive folder into `content/blog/<slug>/images`, resized to 2000 px. To start a post, make its folder in `02 Posts` with the slug as its name.

1. **Idea:** add a row to the plan in §11 (pillar, type, search query, region).
2. **Brief** (10 minutes): the query, the reader, 3–5 headings, the places and numbers to check, the photos needed, the sources.
3. **Scaffold:** `npm run blog:new -- <slug> --type <type> --region <id>` (`--region none` for a tip; it then sits under Ride smarter).
4. **Draft** in `en.md` with `status: draft`. AI help is fine; then set `aiAssisted: true` and write `howWeMade`. A person who rode or checked it is the author.
5. **Check:** `npm run blog:check`. Fix errors; read the warnings.
6. **Preview:** `npm run blog:preview && npm run serve:rebuild`, then open `/blog/<slug>`.
7. **Slovenian:** write `sl.md` (own slug, title, description).
8. **Publish:** set `status: published` and today's `datePublished`, fill `facts` and `sources`, open a PR. The post goes live when the PR merges and `JOURNAL_PUBLIC` is on.

### Pre-publish checklist

- [ ] Title ≤ 7 words, describes a place or a claim
- [ ] Description is one sentence, ≤ 160 characters, and names the place
- [ ] The search query is in the title, slug and first paragraph
- [ ] Every place has a reason it is bike-friendly; anything unchecked says "not confirmed yet"
- [ ] Numbers are true today and come from `sources`
- [ ] Hero follows §7 (no faces, no cars, real roads); every image has alt, credit and licence
- [ ] 2+ internal links; `relatedTours` set where a route fits
- [ ] FAQ (spot-list, route-guide, itinerary)
- [ ] `aiAssisted` is honest, with `howWeMade` if true
- [ ] `npm run blog:check` passes and the post looks right in the preview, on desktop and at 375 px

---

## 10. Before the journal goes public

The engine is done; these are content and decisions. `JOURNAL_PUBLIC` lives in `rebuild/scripts/pages.js`.

| Item | Owner | State |
| --- | --- | --- |
| Author bio (EN + SL) and a square photo in `_authors/jakob-robic.yml` (and Tanja's, if she writes) | Jakob | placeholder |
| Real hero photos for the four drafts. The current ones show kayaks, rafting and a driver in a car, with no bike in any of them, and they are 600–720 px wide. All break §7 | Jakob | to replace |
| The four drafts: `facts`, `sources`, 600+ words, 2+ internal links each (`npm run blog:check` lists what is missing) | writer | to do |
| "Cycling in Gorenjska" region hub, so /blog has a feature | writer | not started |
| "Ride smarter" pillar hub | writer | drafted; hero is a placeholder |
| Slovenian versions of the first posts (the SL hub shows "read in English" until then) | writer | not started |
| Places: Slovenia, Austria, Italy and Croatia are mapped with regions and areas. Check the region split and the Slovenian names | Jakob | to check |
| A launch batch of at least 6 published posts | writer | 0 of 6 |
| Flip `JOURNAL_PUBLIC = true` | Jakob | off |

---

## 11. First 12 posts

Ordered so the hub fills in the right order. Search queries are the target; check volume before writing.

| # | Title (≤ 7 words) | Pillar | Type · hubLevel | Where · parentHub | Tags | Search query | Uses |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Ride smarter | Ride smarter | practical · pillar | none · blog | planning | e-bike ride planning | draft exists |
| 1 | Cycling in Gorenjska | Ride it | route-guide · region | gorenjska · blog | climbs, stays | cycling gorenjska / kolesarjenje gorenjska | all Gorenjska featured routes |
| 2 | Charging stops around Bled | Where to stop | spot-list · guide | gorenjska / bled · cycling-in-gorenjska | charging, cafes | e-bike charging bled | app chargers, `blejcanka` |
| 3 | Prelaz Ljubelj by e-bike | Ride it | route-guide · guide | gorenjska / trzic · cycling-in-gorenjska | climbs, borders | ljubelj pass by bike | `k35-prelaz-ljubelj` |
| 4 | Planning your first battery-aware day ride | Ride smarter | practical · guide | none · ride-smarter | planning, charging | e-bike range planning | draft exists |
| 5 | Bike-friendly stays in Jezersko | Where to stop | spot-list · guide | gorenjska / jezersko · cycling-in-gorenjska | stays | jezersko accommodation cyclists | `k16-trzic-jezersko`, `jezerski-vrh` |
| 6 | What makes a place bike-friendly? | Bike-friendly places | story · guide | none · blog | stays, charging | bike friendly accommodation criteria | draft exists |
| 7 | Tržič to Jezersko in one day | Ride it | route-guide · guide | gorenjska / trzic · cycling-in-gorenjska | climbs | trzic jezersko cycling | `k16-trzic-jezersko` |
| 8 | Coffee stops around Tržič | Where to stop | spot-list · guide | gorenjska / trzic · cycling-in-gorenjska | cafes | cafés tržič cycling | `trzicanka`, `k21-dom-pod-storzicem` |
| 9 | Reading elevation before a cross-border ride | Ride smarter | practical · guide | none · ride-smarter | climbs, borders | elevation profile cycling | draft exists |
| 10 | A weekend around Kamnik and Kranj | Ride it | itinerary · guide | osrednjeslovenska / kamnik · blog | stays | cycling weekend slovenia | `kamnicanka`, `k52-pot-treh-zvonov` |
| 11 | Charging at cafés and guesthouses | Ride smarter | practical · guide | none · ride-smarter | charging | e-bike charging café | draft exists (retitle) |
| 12 | Where to refill water in Gorenjska | Where to stop | spot-list · guide | gorenjska · cycling-in-gorenjska | water | drinking water fountains cycling | app water places |

Write "Cycling in Slovenia" (a country hub) once Central Slovenia or Primorska has its own region hub.

### Next: across the border

Once the first 12 are out. These make the Country filter appear and are where `borders` earns its place.

| # | Title (≤ 7 words) | Pillar | Type · hubLevel | Where · parentHub | Tags | Search query |
| --- | --- | --- | --- | --- | --- | --- |
| 13 | Over Ljubelj to Lake Wörthersee | Ride it | itinerary · guide | carinthia / worthersee · blog | borders, climbs, stays | ljubelj to wörthersee by bike |
| 14 | The Drava cycle path, Austria to Slovenia | Ride it | route-guide · guide | carinthia / villach · blog | cycle-paths, borders, trains | drava cycle path |
| 15 | Parenzana from Trieste to Poreč | Ride it | route-guide · guide | istria / porec · blog | cycle-paths, borders, water | parenzana bike trail |
| 16 | Wine roads of Brda and Collio | Where to stop | spot-list · guide | primorska / brda · blog | wine, borders, food | brda collio cycling |
| 17 | Alpe-Adria path from Tarvisio | Ride it | route-guide · guide | friuli-venezia-giulia / tarvisio · blog | cycle-paths, trains | alpe adria cycle path |
