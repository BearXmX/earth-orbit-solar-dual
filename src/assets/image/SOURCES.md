# Image sources

## nasa-starmap-8k.jpg (current background)

- Image: NASA **Deep Star Maps** (2012), celestial-coordinate star map, 8192 × 4096 pixels.
- Credit: **NASA/Goddard Space Flight Center Scientific Visualization Studio**.
- Official image, download choices and credits: https://svs.gsfc.nasa.gov/3895/
- Download: https://svs.gsfc.nasa.gov/vis/a000000/a003800/a003895/starmap_8k.jpg
- Downloaded on 2026-09-17; JPEG is 7,200,691 bytes. The complete image decodes at 8192 × 4096.
- SHA-256: ec28e645863d55d4c0513a07fc846eaf06fc4f4b2246e4a6b10535f990309360
- NASA SVS states its content is public domain unless otherwise noted: https://svs.gsfc.nasa.gov/help/
- Media guidelines: https://www.nasa.gov/nasa-brand-center/images-and-media/
- This star map has no constellation overlays. The constellation figure credits on the source page apply to the separate constellation figures, which are not used here.
- Local usage: createNebulaSkybox.ts imports the JPEG with ?inline. Vite embeds it in each offline export; no runtime download is required.
- Display: reduced exposure, mild sharpening, nearly neutral cool stars and a new panorama orientation. The downloaded JPEG itself is unchanged.

## milky-way-6k.jpg (previous background, no longer imported)

- The Milky Way panorama, ESO image eso0932a, 6000 × 3000.
- Credit: ESO/S. Brunier.
- Original: https://www.eso.org/public/images/eso0932a/
- Previously downloaded from https://zdys.szjx.ai-study.net/geo-resources-folder/images/milky-way-6k.jpg
- This retained source file is not included in the current offline build.

The solar apparent motion and ground observer scenes use a procedural day/night sky, without either panorama or environment fog. The existing Earth and Sun image files remain unchanged.
