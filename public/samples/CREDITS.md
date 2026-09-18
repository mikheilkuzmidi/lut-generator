# Sample frames

Six photographs to try a LUT on, chosen to cover the cases a grade is actually
judged by rather than to look pretty:

| File | What it tests |
| --- | --- |
| `mountain-snow.jpg` | blown highlights and almost no chroma, so highlight rolloff shows immediately |
| `peak-sunset.jpg` | deep shadow against a warm horizon, which is where a shadow lift goes muddy |
| `mountain-lake.jpg` | greens and a mirrored tonal range, where a tint shift goes wrong first |
| `harbour-boats.jpg` | saturated cyan paint, the first thing a saturation push breaks |
| `sailboat-sea.jpg` | a silhouette against specular water, already clipped before you touch it |
| `sailboat-fog.jpg` | very low contrast and near monochrome, where a contrast push has nothing to grab |

Mountains and boats on purpose. They are what camera makers shoot their own
sensor tests on, for the same reason: snow, water, sky and paint between them
cover blown highlights, specular clipping, a wide neutral range and a saturated
primary, which is most of what a colour transform can get wrong.

All six are cropped to 1400x788 and saved as JPEG. Nothing else was done to
them, which matters: a sample image for a grading tool has to be ungraded.

## Source and licence

Every file is CC0 or public domain, so it can be redistributed inside this
repository with no condition beyond the credit below. Each licence was read
from the file's own metadata on Wikimedia Commons rather than taken from a
site's blanket claim.

- **`mountain-snow.jpg`** from [Imposing mountain under snow (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Imposing_mountain_under_snow_(Unsplash).jpg), CC0, by Maximilian Wachter motive_watcher, native 4272x2848
- **`peak-sunset.jpg`** from [Sunset over snow capped Ciucas Peak (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Sunset_over_snow_capped_Ciucas_Peak_(Unsplash).jpg), CC0, by David Marcu davidmarcu, native 2848x2848
- **`mountain-lake.jpg`** from [Mountain reflection in a lake (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Mountain_reflection_in_a_lake_(Unsplash).jpg), CC0, by Gabriel Santiago gabrielssantiago, native 3264x4896
- **`harbour-boats.jpg`** from [Blue fishing boat harbour Eretria Euboea Greece.jpg](https://commons.wikimedia.org/wiki/File:Blue_fishing_boat_harbour_Eretria_Euboea_Greece.jpg), CC0, by Jebulon, native 5087x4000
- **`sailboat-sea.jpg`** from [A sailboat on Adriatic sea.jpg](https://commons.wikimedia.org/wiki/File:A_sailboat_on_Adriatic_sea.jpg), CC0, by Altitonantis, native 5873x3915
- **`sailboat-fog.jpg`** from [Sailboat on sea in fog.jpg](https://commons.wikimedia.org/wiki/File:Sailboat_on_sea_in_fog.jpg), Public domain, by an unknown author, native 2592x1944

CC0: <https://creativecommons.org/publicdomain/zero/1.0/>

## Why not a camera maker's sample footage

The obvious place to look is the sample clips and stills the camera makers
publish, which are shot exactly for this. They cannot be used here. Those are
licensed for use inside your own productions and explicitly not for
redistribution, resale or re-licensing as standalone assets, and committing
them to a public repository is redistributing them as standalone assets. CC0
material carries no such condition, which is why it is what ships.
