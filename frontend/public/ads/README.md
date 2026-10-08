# Advertising artwork

`build-ads.mjs` reads the advertiser's own photographs from this folder and
composes the creatives into `out/`. Those are the deliverable: they are
uploaded through the admin (Content → Advertising) like any other artwork, and
nothing on the site reads them from here.

    node scripts/build-ads.mjs          # needs the dev server running
    cd ../api && npx tsx scripts/seed-ads.mts

## What is in here

Supplied by learnsbuy.com. The teacher's photographs, the Learnsbuy mark, and
one finished banner of theirs which the crops of the teacher and of the
broadcaster marks are taken from.

The broadcaster marks (GMM, True ปลูกปัญญา, ETV, Dek-D) are other companies'
trademarks. They are cropped out of the advertiser's own banner rather than
redrawn, because the advertiser is the one with permission to use them — if
that permission ever lapses, the strip comes out of `build-ads.mjs`.

The classroom photograph shows identifiable students. Consent for using it in
advertising is the advertiser's to hold.

## Sizes

Each campaign needs two, because the reserved box is a different shape on each:

| | ratio | recommended | minimum |
|---|---|---|---|
| desktop | 4:1 | 1600 × 400 | 1200 × 300 |
| phone | 4:5 | 800 × 1000 | 600 × 750 |
