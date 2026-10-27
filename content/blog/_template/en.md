---
# Template for a journal post. Folders starting with _ are never built.
# Copy with: npm run blog:new -- <slug> --type <type>. Rules: content/blog/README.md §5.
status: draft
translationKey: __SLUG__
slug: __SLUG__
# 7 words or fewer. A place or a claim, sentence case.
title: __TITLE__
# One sentence, 160 characters or fewer, ending with a full stop. Name the place.
description: __DESCRIPTION__
datePublished: __TODAY__
dateUpdated: __TODAY__
author: jakob-robic
# route-guide | spot-list | itinerary | practical | story
type: __TYPE__
# pillar | country | region | area | guide
hubLevel: guide
# blog, ride-smarter (tips), or the translationKey of a region/area hub
parentHub: blog
# Leave region out for a tip. Country comes from the region (gorenjska, carinthia, istria, ...).
region: __REGION__
# area: bled
activities:
  - e-bike
# 1–3 topics from _taxonomy.yml (README §2). Stops: cafes food stays huts charging water repairs
# viewpoints wine. Riding: climbs cycle-paths quiet-roads family first-rides.
# Planning: planning range borders trains weather safety gear.
tags: []
hero:
  # Landscape, 1600 px wide or more. Real roads, rider from behind, no faces, no cars.
  src: images/hero.jpg
  alt: __HERO_ALT__
  credit: Zyflow
  licence: own
# Required to publish. route-guide and itinerary need distanceKm, climbM, difficulty, bestSeason.
facts:
  bestSeason: Apr–Oct
  # distanceKm: 26
  # climbM: 900
  # difficulty: intermediate
  # eat: Dom pod Storžičem
  # sleep: Gostišče …
  # charge: Cafés in Tržič
# Required to publish. kind: ridden | own-gpx | own-photos | notes | partner | municipality | app-data
sources:
  - kind: ridden
    note: __SOURCE_NOTE__
relatedTours: []
relatedPosts: []
aiAssisted: false
# Required if aiAssisted is true, one sentence:
# howWeMade: Ridden by Jakob, drafted with AI help from his notes, checked by Jakob.
---

__INTRO__ Two or three sentences: the place, who this is for, and what you will know at the end. Put the search query in here.

## First heading

Two to four short paragraphs. Every place has a reason it is bike-friendly. Anything not checked says "not confirmed yet".

## Second heading

- **A list item that leads with the point.** Then the detail
- **Another one.** Keep each item to one line

> One line worth sharing.

## Third heading

:::figure src="images/hero.jpg" alt="What is in the picture, for someone who cannot see it" credit="Zyflow" licence="own"
A one-sentence caption with a number or a place.
:::

:::faq
### A question people actually search?
A direct answer in one or two sentences.
### A second question?
Another direct answer.
:::

:::app-cta
:::
