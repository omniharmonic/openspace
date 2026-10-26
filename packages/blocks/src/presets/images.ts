import type { ImageValue } from "@openspace/schema";

/**
 * Demo photography for section presets. Every photo is an Unsplash image (Unsplash License:
 * free to use, modify and redistribute, no attribution required — credited anyway in
 * {@link PRESET_IMAGE_CREDITS}). Each URL was checked to return HTTP 200, and the intrinsic size
 * recorded here comes from imgix's `fm=json` metadata for the original file.
 *
 * Presets never use the original file: {@link photo} asks imgix for a width close to twice the
 * size the image is displayed at (the Design check flags images above 2× their displayed size),
 * and the renderer adds a responsive `srcset` for imgix hosts on top.
 */

export interface DemoPhoto {
  /** Unsplash photo id (the `photo-…` part of the images.unsplash.com URL). */
  id: string;
  /** Original pixel size. */
  w: number;
  h: number;
  alt: string;
  /** Focal point when the subject is off-centre (0..1). */
  focal?: readonly [number, number];
}

const p = (
  id: string,
  w: number,
  h: number,
  alt: string,
  focal?: readonly [number, number],
): DemoPhoto => ({ id, w, h, alt, ...(focal ? { focal } : {}) });

export const PHOTOS = {
  // wellness / studio
  yogaDeck: p(
    "1506126613408-eca07ce68773",
    2202,
    2560,
    "A woman meditating cross-legged on a wooden deck at sunrise",
  ),
  yogaSilhouette: p(
    "1544367567-0f2fcb009e0b",
    5815,
    3666,
    "A person holding a low lunge on the beach at dusk, arms raised",
    [0.45, 0.5],
  ),
  beachClass: p(
    "1545205597-3d9d02c29597",
    5184,
    3456,
    "A small group practising tree pose together on a misty beach",
  ),
  studioStretch: p(
    "1518611012118-696072aa579a",
    5760,
    3840,
    "Two women stretching on mats in a bright brick-walled studio",
  ),
  massage: p(
    "1544161515-4ab6ce6db874",
    6000,
    4000,
    "A therapist pouring warm oil before a back massage",
  ),
  homeWorkout: p(
    "1571019613454-1cb2f99b2d8b",
    4680,
    3120,
    "A woman doing sit-ups on a mat in a sunlit living room",
  ),
  gym: p(
    "1534438327276-14e5300c3a48",
    4272,
    2848,
    "Rows of dumbbells on racks in a quiet, light-filled gym",
  ),
  // food & drink
  dinner: p(
    "1414235077428-338989a2e8c0",
    4402,
    2935,
    "A plated dish on a candlelit dinner table set for friends",
  ),
  dining: p(
    "1517248135467-4c7edcad34c4",
    5596,
    3731,
    "A warm, dimly lit restaurant dining room before service",
  ),
  terrace: p(
    "1559339352-11d035aa65de",
    3264,
    2448,
    "A covered restaurant terrace with blue chairs overlooking the water",
  ),
  sharedTable: p(
    "1528605248644-14dd04022da1",
    5436,
    3624,
    "Friends talking over a long shared table on a rooftop",
  ),
  breadLoaves: p(
    "1509440159596-0249088772ff",
    3872,
    2576,
    "Two rustic sourdough loaves dusted with flour beside wheat stalks",
  ),
  breadSliced: p(
    "1549931319-a545dcf3bc73",
    4794,
    3196,
    "A seeded loaf cut into thick slices on a wooden board",
  ),
  croissant: p(
    "1555507036-ab1f4038808a",
    3508,
    2806,
    "A golden croissant being dusted with sugar on a dark slate",
  ),
  bakeryShelves: p(
    "1778472506771-22d00e974d2f",
    8103,
    5369,
    "Three rustic loaves cooling side by side",
  ),
  cookies: p(
    "1499636136210-6f4ee915583e",
    2678,
    3349,
    "Chocolate chip cookies scattered on a pale linen cloth",
  ),
  cake: p(
    "1626263468007-a9e0cf83f1ac",
    4800,
    3200,
    "A chocolate drip cake topped with cookies and cream",
  ),
  pancakes: p(
    "1650134973809-d8c3a2da59ba",
    4200,
    2800,
    "A tall stack of pancakes with blueberries and syrup",
  ),
  pizza: p(
    "1513104890138-7c749659a591",
    5184,
    3456,
    "A wood-fired pizza cut into slices on a dark table",
  ),
  saladBowl: p(
    "1512621776951-a57141f2eefd",
    5184,
    3456,
    "A bowl of greens, avocado, chickpeas and roasted vegetables",
  ),
  plates: p(
    "1504674900247-0877df9cc836",
    4350,
    2900,
    "Seared steak, herbs and dipping sauces shared across the table",
  ),
  chefPrep: p(
    "1551218808-94e220e084d2",
    3648,
    5472,
    "A cook chopping fresh herbs on a white board",
    [0.5, 0.4],
  ),
  coffeeCheers: p(
    "1495474472287-4d71bcdd2085",
    6720,
    4480,
    "Four friends raising lattes over a wooden table",
  ),
  coffeeTable: p(
    "1509042239860-f550ce710b93",
    4480,
    6720,
    "Two cappuccinos with latte art beside potted herbs",
  ),
  pourOver: p(
    "1442512595331-e89e73853f31",
    5598,
    3732,
    "A barista pouring water over a coffee filter at the bar",
  ),
  coffeeBeans: p(
    "1447933601403-0c6688de566e",
    4889,
    3728,
    "A close view of freshly roasted coffee beans",
  ),
  cafeInterior: p(
    "1555396273-367ea4eb4db5",
    3883,
    2912,
    "A rustic café with wooden tables and pendant lights",
  ),
  cafeSign: p("1775742945898-ec8b18e8a408", 6000, 4500, "A chalkboard menu outside a café"),
  // interiors & places
  livingRoom: p(
    "1583847268964-b28dc8f51f92",
    4000,
    6000,
    "A bright living room with a pale sofa, cushions and a low table",
  ),
  loungePlants: p(
    "1502672260266-1c1ef2d93688",
    3000,
    2232,
    "A sunny living room with a grey sofa, shelves of books and hanging plants",
  ),
  bohoLounge: p(
    "1556228453-efd6c1ff04f6",
    3600,
    2400,
    "A warm living room with a rust sofa, woven wall hanging and potted palms",
  ),
  yellowChair: p(
    "1586023492125-27b2c045efd7",
    3400,
    3000,
    "A yellow armchair, floor lamp and framed print against a white wall",
  ),
  greenSofa: p(
    "1555041469-a586c61ea9bc",
    5760,
    3840,
    "A deep green velvet sofa on pale floorboards",
  ),
  orangeSofa: p(
    "1567016432779-094069958ea5",
    4160,
    4160,
    "A rust-orange sofa with a pink cushion against a soft green wall",
  ),
  stool: p(
    "1503602642458-232111445657",
    5304,
    7952,
    "A simple wooden stool against a pale blue wall",
  ),
  kitchen: p(
    "1484154218962-a197022b5858",
    4288,
    2848,
    "A clean white kitchen with pendant lights and bar stools",
  ),
  modernHouse: p(
    "1568605114967-8130f3a36994",
    3000,
    2000,
    "A dark timber house with glowing windows at dusk",
  ),
  porchHouse: p(
    "1570129477492-45c003edd2be",
    6720,
    4480,
    "A white clapboard house with a wraparound porch and green lawn",
  ),
  poolHouse: p(
    "1512917774080-9991f1c4c750",
    5566,
    3711,
    "A white modern villa with a pool framed by palms",
  ),
  officeDesks: p(
    "1497215728101-856f4ea42174",
    5472,
    3648,
    "Standing desks by tall windows with a palm in the corner",
  ),
  coworking: p(
    "1556761175-5973dc0f32e7",
    4767,
    2681,
    "A man presenting to colleagues in a brick-walled loft office",
  ),
  // work & people
  teamTable: p(
    "1522202176988-66273c2fd55f",
    5231,
    3487,
    "Three colleagues laughing around laptops at a shared table",
  ),
  workshop: p(
    "1758876203195-69a51e4145f0",
    3840,
    2160,
    "Colleagues planning a project with sticky notes on a wall",
  ),
  meeting: p(
    "1542744173-8e7e53415bb0",
    6000,
    4000,
    "A team listening to a presentation around a boardroom table",
  ),
  highFive: p(
    "1600880292203-757bb62b4baf",
    9504,
    6336,
    "Two colleagues high-fiving across a desk covered in papers",
  ),
  deskFlatlay: p(
    "1497032628192-86f99bcd76bc",
    4827,
    3218,
    "A tidy wooden desk with a notebook, coffee and laptop seen from above",
  ),
  writing: p(
    "1434030216411-0b793f4b4173",
    5184,
    3456,
    "A person writing notes in a notebook beside a mug",
  ),
  blueprint: p(
    "1503387762-592deb58ef4e",
    6000,
    3376,
    "An architect sketching over a set of drawings",
  ),
  analytics: p(
    "1551288049-bebda4e38f71",
    4810,
    3207,
    "A monitor showing charts and a dashboard in a dark room",
  ),
  laptopCode: p(
    "1476365518243-f738bf58443d",
    3539,
    5316,
    "A laptop on a pale desk beside a small plant",
  ),
  friendsSunset: p(
    "1511632765486-a01980e01a18",
    5472,
    3648,
    "Friends with their arms around each other watching the sunset",
  ),
  friendsBench: p(
    "1529156069898-49953e39b3ac",
    5884,
    3310,
    "A group of friends sitting together on a wall facing the sea",
  ),
  kidsSmiling: p(
    "1488521787991-ed7bbaae773c",
    5184,
    3456,
    "A group of children grinning and making peace signs at the camera",
  ),
  conference: p(
    "1540575467063-178a50c2df87",
    5472,
    3648,
    "An audience in a dark hall facing a lit stage",
  ),
  speaker: p(
    "1475721027785-f74eccf877e2",
    5472,
    3648,
    "A microphone on a stand in front of a blurred conference audience",
  ),
  concert: p(
    "1501386761578-eac5c94b800a",
    6000,
    4000,
    "A crowd cheering with raised hands at a live show",
  ),
  stageLights: p(
    "1669459868647-4c2f1c564052",
    5702,
    3801,
    "A crowd facing a lit stage at a small music venue",
  ),
  microphone: p(
    "1511671782779-c97d3d27a1d4",
    5184,
    3456,
    "A vintage microphone in warm stage light",
  ),
  weddingHands: p(
    "1465495976277-4387d4b0b4c6",
    6000,
    4000,
    "A couple's hands with wedding rings resting on a bouquet",
  ),
  weddingAisle: p(
    "1660286156087-911df708e663",
    6240,
    4160,
    "A couple walking back down the aisle as guests cheer",
  ),
  // portraits
  portraitLake: p(
    "1438761681033-6461ffad8d80",
    5184,
    3456,
    "Portrait of a woman with short auburn hair beside a lake",
  ),
  portraitDaniel: p(
    "1500648767791-00dcc994a43e",
    3000,
    4499,
    "Portrait of a man in a grey sweater, smiling softly",
  ),
  portraitAna: p(
    "1494790108377-be9c29b29330",
    3744,
    5616,
    "Portrait of a woman in a red sweater, laughing",
  ),
  portraitSam: p(
    "1507003211169-0a1dd7228f2d",
    3569,
    5354,
    "Portrait of a smiling man in a white t-shirt",
  ),
  portraitMaya: p(
    "1580489944761-15a19d654956",
    3974,
    5000,
    "Portrait of a woman with dark hair pinned up, smiling",
  ),
  portraitTheo: p(
    "1539571696357-5a69c17a67c6",
    2662,
    3993,
    "Portrait of a young man in a black hat, smiling",
  ),
  portraitIris: p(
    "1534528741775-53994a69daeb",
    3276,
    4096,
    "Portrait of a woman in a black top against a soft violet wall",
  ),
  portraitOwen: p(
    "1780387477222-730504564368",
    5792,
    8688,
    "Portrait of a smiling grey-haired woman in a beige jumpsuit",
  ),
  portraitClara: p(
    "1544005313-94ddf0286df2",
    4912,
    7360,
    "Portrait of a woman with long brown hair in a striped shirt",
  ),
  portraitNina: p(
    "1573496359142-b8d87734a5a2",
    4016,
    6016,
    "Portrait of a woman in a grey blazer by a sunlit window",
  ),
  portraitMarcus: p(
    "1560250097-0b93528c311a",
    3149,
    4724,
    "Portrait of a man in a dark suit and glasses",
  ),
  // making & craft
  pottery: p(
    "1597696929736-6d13bed8e6a8",
    5881,
    3921,
    "Handmade ceramic vases in soft clay colours on a shelf",
  ),
  ceramics: p(
    "1565193566173-7a0ee3dbe261",
    4896,
    3264,
    "Three matte grey vases with dried stems against a dark wall",
  ),
  paintbrushes: p(
    "1513364776144-60967b0f800f",
    5000,
    3333,
    "A paintbrush dragging bright red paint across a palette",
  ),
  gallery: p(
    "1513519245088-0e12902e5a38",
    5760,
    3840,
    "A wall of framed prints arranged on narrow picture ledges",
  ),
  plantPot: p(
    "1459411552884-841db9b3cc2a",
    2449,
    3000,
    "A small cactus in a terracotta pot against a blush wall",
  ),
  succulent: p(
    "1485955900006-10f4d324d411",
    5456,
    3632,
    "A spiky succulent in a mint-green pot on a white table",
  ),
  seedlings: p(
    "1466692476868-aef1dfb1e735",
    5760,
    3840,
    "Young seedlings sprouting in a dark tray of soil",
  ),
  gardenTrowel: p(
    "1782386963665-b83ce1d6752e",
    8076,
    5387,
    "Gloved hands planting seedlings in a garden bed",
  ),
  books: p(
    "1456513080510-7bf3a84b82f8",
    4592,
    3448,
    "An open book on a table in front of a full bookshelf",
  ),
  // products
  camera: p(
    "1526170375885-4d8ecf77b99f",
    3888,
    2592,
    "A white instant camera on a pale grey background",
  ),
  headphones: p(
    "1505740420928-5e560c06d30e",
    5760,
    3840,
    "Black over-ear headphones on a bright yellow background",
  ),
  watch: p(
    "1523275335684-37898b6baf30",
    3484,
    2531,
    "A white minimalist watch lying on a pale grey surface",
  ),
  sneaker: p(
    "1491553895911-0055eca6402d",
    3000,
    3000,
    "A single dark running shoe suspended against a white background",
  ),
  shirts: p("1555529733-ba28d9c4587c", 3417, 5472, "Shirts hanging in a row on a clothes rail"),
  yogaMats: p(
    "1767605523281-8b54b3692078",
    4480,
    6720,
    "Rolled yoga mats in a woven basket beside a plant",
  ),
  skincare: p(
    "1712168044214-f5a272c23a5b",
    2160,
    2700,
    "A tube of cream on a table against a peach wall",
  ),
  dropper: p(
    "1515377905703-c4788e51af15",
    5175,
    3450,
    "A hand holding a glass dropper of oil against a dark background",
  ),
  // landscapes
  hills: p(
    "1501854140801-50d01698950b",
    2600,
    1548,
    "Rolling green hills seen from above, ridges catching the light",
  ),
  forest: p(
    "1441974231531-c6227db76b6e",
    2560,
    1705,
    "Sunlight falling through tall trees onto a forest path",
  ),
  cliffs: p("1470071459604-3b5ec3a7fe05", 7372, 4392, "Mist rolling over green cliffs at sunrise"),
  bridge: p(
    "1543270915-a8381a52e201",
    4000,
    6000,
    "A person crossing a suspension footbridge into the forest",
  ),
  meadow: p(
    "1465146344425-f00d5f5c8f07",
    4928,
    3264,
    "Wild red poppies scattered through a summer meadow",
  ),
  poppies: p("1490750967868-88aa4486c946", 7952, 5304, "Orange poppies against a clear blue sky"),
  lake: p(
    "1501785888041-af3ef285b470",
    5979,
    3986,
    "A rowing boat on a turquoise lake below jagged mountains",
  ),
  mountainLake: p(
    "1783611066016-59e16b0ac1c8",
    6192,
    4128,
    "Snowy peaks reflected in a still mountain lake",
  ),
  valley: p(
    "1506744038136-46273834b3fb",
    7360,
    4912,
    "A misty river valley with pine trees and granite cliffs at dawn",
  ),
  beach: p(
    "1507525428034-b723cf961d3e",
    4621,
    3072,
    "Gentle waves washing onto an empty beach at sunset",
  ),
  ocean: p("1518837695005-2083093ee35b", 6000, 4000, "Deep blue ocean water under a pale sky"),
  coast: p(
    "1505142468610-359e7d316be0",
    3070,
    5464,
    "An aerial view of turquoise surf meeting a sandy shore",
  ),
  road: p(
    "1500530855697-b586d89ba3ee",
    3648,
    5472,
    "A desert road running straight toward red rock mountains",
  ),
  city: p(
    "1477959858617-67f85cf4f1df",
    3465,
    2131,
    "A city skyline stretching to the lake at golden hour",
  ),
  street: p(
    "1449824913935-59a10b8d2000",
    1920,
    1280,
    "A downtown street lined with tall buildings and yellow cabs",
  ),
  architecture: p(
    "1487958449943-2429e8be8625",
    6000,
    4000,
    "A white angular building against a bright, clear sky",
  ),
} as const satisfies Record<string, DemoPhoto>;

export type PhotoKey = keyof typeof PHOTOS;

/** Aspect ratios presets crop to (the image block's `aspect` options). */
export type CropAspect = "original" | "1:1" | "4:5" | "2:3" | "3:2" | "16:9" | "21:9";

function aspectValue(aspect: CropAspect, photo: DemoPhoto): number {
  if (aspect === "original") return photo.w / photo.h;
  const [w, h] = aspect.split(":").map(Number) as [number, number];
  return w / h;
}

/**
 * The width a photo must have so it still covers `displayWidth` CSS px after being cropped to
 * `aspect` (a portrait crop of a landscape photo uses only part of its width).
 */
export function coverWidth(
  photo: { w: number; h: number },
  displayWidth: number,
  aspect: number,
): number {
  const photoAspect = photo.w / photo.h;
  return displayWidth * Math.max(1, photoAspect / aspect);
}

/**
 * An image value for a demo photo, sized for where it is shown: `displayWidth` is the largest
 * CSS width the image is drawn at (desktop), `aspect` its crop. The requested width is ~2× that
 * (sharp on high-density screens, never above the Design check's 2× limit) and never larger
 * than the original.
 */
export function photo(
  key: PhotoKey,
  displayWidth: number,
  aspect: CropAspect = "original",
): ImageValue {
  const ph: DemoPhoto = PHOTOS[key];
  const needed = coverWidth(ph, displayWidth, aspectValue(aspect, ph));
  const width = Math.min(ph.w, Math.max(320, Math.floor((needed * 2) / 40) * 40));
  const height = Math.round((width * ph.h) / ph.w);
  return {
    src: `https://images.unsplash.com/photo-${ph.id}?w=${width}&q=80`,
    alt: ph.alt,
    width,
    height,
    ...(ph.focal ? { focal: [ph.focal[0], ph.focal[1]] as [number, number] } : {}),
  };
}

/**
 * Photographer credits: Unsplash photo id → [name, username, photo page slug]. Each entry was
 * checked against the public photo page (https://unsplash.com/photos/<slug>), which shows the
 * same image id, the photographer's name and their @username.
 */
const PHOTO_CREDITS: Record<string, readonly [name: string, username: string, slug: string]> = {
  "1506126613408-eca07ce68773": [
    "Jared Rice",
    "jareddrice",
    "woman-doing-yoga-meditation-on-brown-parquet-flooring-NTyBbu66_SI",
  ],
  "1544367567-0f2fcb009e0b": [
    "kike vega",
    "kikekiks",
    "silhouette-photography-of-woman-doing-yoga-F2qh3yjz6Jk",
  ],
  "1545205597-3d9d02c29597": [
    "Kaylee Garrett",
    "realkayls",
    "five-woman-standing-on-seashore-GaprWyIw66o",
  ],
  "1518611012118-696072aa579a": [
    "bruce mars",
    "brucemars",
    "group-of-women-doing-yoga-gJtDg6WfMlQ",
  ],
  "1544161515-4ab6ce6db874": [
    "alan caishan",
    "caishan119",
    "woman-lying-with-prone-position-cU53ZFBr3lk",
  ],
  "1571019613454-1cb2f99b2d8b": [
    "Jonathan Borba",
    "jonathanborba",
    "woman-exercising-indoors-lrQPTQs7nQQ",
  ],
  "1534438327276-14e5300c3a48": [
    "Danielle Cerullo",
    "dncerullo",
    "woman-standing-surrounded-by-exercise-equipment-CQfNt66ttZM",
  ],
  "1414235077428-338989a2e8c0": [
    "Jay Wennington",
    "jaywennington",
    "dish-on-white-ceramic-plate-N_Y88TWmGwA",
  ],
  "1517248135467-4c7edcad34c4": [
    "Jason Leung",
    "ninjason",
    "photo-of-pub-set-in-room-during-daytime-poI7DelFiVA",
  ],
  "1559339352-11d035aa65de": [
    "Albert",
    "picturesbyalbert",
    "a-restaurant-with-a-view-of-the-water-YYZU0Lo1uXE",
  ],
  "1528605248644-14dd04022da1": [
    "Priscilla Du Preez 🇨🇦",
    "priscilladupreez",
    "people-sitting-in-front-of-table-talking-and-eating-W3SEyZODn8U",
  ],
  "1509440159596-0249088772ff": [
    "Wesual Click",
    "wesual",
    "rustic-bread-loaves-with-wheat-stalks-rsWZ-P9FbQ4",
  ],
  "1549931319-a545dcf3bc73": [
    "Jude Infantini",
    "judowoodo_",
    "selective-focus-photography-of-sliced-bread-rYOqbTcGp1c",
  ],
  "1555507036-ab1f4038808a": ["Mae Mu", "picoftasty", "two-brown-croissants-m9pzwmxm2rk"],
  "1778472506771-22d00e974d2f": [
    "Renee Hughes",
    "reneehughes",
    "three-loaves-of-whole-grain-bread-on-a-white-cloth-ucHcsGJv9u0",
  ],
  "1499636136210-6f4ee915583e": [
    "Food Photographer | Jennifer Pallian",
    "foodess",
    "close-up-photo-of-baked-cookies-OfdDiqx8Cz8",
  ],
  "1626263468007-a9e0cf83f1ac": [
    "Syed Maaz",
    "syedmaaz904",
    "chocolate-cake-with-chocolate-syrup-on-top-QLSh4y2v93c",
  ],
  "1650134973809-d8c3a2da59ba": [
    "Amber Fisher",
    "lindsaysworld",
    "a-stack-of-pancakes-covered-in-blueberries-and-syrup-krqTbKwuFgw",
  ],
  "1513104890138-7c749659a591": [
    "Ivan Torres",
    "iavnt",
    "cheese-pizza-with-tomatoes-and-rosemary-MQUqbmszGGM",
  ],
  "1512621776951-a57141f2eefd": [
    "Anna Pelzer",
    "annapelzer",
    "bowl-of-vegetable-salads-IGfIGP5ONV0",
  ],
  "1504674900247-0877df9cc836": [
    "Lily Banse",
    "lvnatikk",
    "three-plates-of-asian-food-on-wood-table--YHSwy6uqvk",
  ],
  "1551218808-94e220e084d2": [
    "Jonathan Borba",
    "jonathanborba",
    "person-slicing-vegetable-uB7q7aipU2o",
  ],
  "1495474472287-4d71bcdd2085": [
    "Nathan Dumlao",
    "nate_dumlao",
    "three-person-holding-beverage-cups-6VhPY27jdps",
  ],
  "1509042239860-f550ce710b93": [
    "Nathan Dumlao",
    "nate_dumlao",
    "shallow-focus-photography-of-coffee-late-in-mug-on-table-zUNs99PGDg0",
  ],
  "1442512595331-e89e73853f31": [
    "Karl Fredrickson",
    "kfred",
    "person-filling-glass-container-TYIzeCiZ_60",
  ],
  "1447933601403-0c6688de566e": ["Mike Kenneally", "asthetik", "coffee-bean-lot-TD4DBagg2wE"],
  "1555396273-367ea4eb4db5": [
    "Shawn",
    "shawnanggg",
    "interior-of-rustic-cafe-with-wooden-tables-nmpW_WwwVSc",
  ],
  "1775742945898-ec8b18e8a408": [
    "Annie Spratt",
    "anniespratt",
    "chalkboard-menu-outside-a-french-cafe-with-coffee-prices-QOM-ulmcLpE",
  ],
  "1583847268964-b28dc8f51f92": [
    "Minh Pham",
    "minhphamdesign",
    "a-living-room-filled-with-furniture-and-a-large-window-OtXADkUh3-I",
  ],
  "1502672260266-1c1ef2d93688": [
    "Patrick Perkins",
    "patrickperkins",
    "gray-fabric-loveseat-near-brown-wooden-table-3wylDrjxH-E",
  ],
  "1556228453-efd6c1ff04f6": [
    "Curology",
    "curology",
    "brown-leather-sofa-and-two-pink-sofa-chair-6CJg-fOTYs4",
  ],
  "1586023492125-27b2c045efd7": [
    "Kam Idris",
    "ka_idris",
    "brown-wooden-framed-yellow-padded-chair-_HqHX3LBN18",
  ],
  "1555041469-a586c61ea9bc": ["Phillip Goldsberry", "phillipgold", "green-fabric-sofa-fZuleEfeA1Q"],
  "1567016432779-094069958ea5": ["Inside Weather", "insideweather", "red-fabric-sofa-dbH_vy7vICE"],
  "1503602642458-232111445657": [
    "Ruslan Bardash",
    "ruslanbardash",
    "beige-wooden-bar-stool-4kTbAMRAHtQ",
  ],
  "1484154218962-a197022b5858": [
    "Naomi Hébert",
    "naomish",
    "gray-steel-3-door-refrigerator-near-modular-kitchen-MP0bgaS_d1c",
  ],
  "1568605114967-8130f3a36994": [
    "vu anh",
    "naomi365photography",
    "brown-and-black-wooden-house-TiVPTYCG_3E",
  ],
  "1570129477492-45c003edd2be": ["todd kent", "churchoftodd", "gray-wooden-house-178j8tJrNlc"],
  "1512917774080-9991f1c4c750": [
    "Frames For Your Heart",
    "framesforyourheart",
    "white-and-grey-concrete-building-near-swimming-pool-under-clear-sky-during-daytime-2d4lAQAlbDA",
  ],
  "1497215728101-856f4ea42174": [
    "Alesia Kazantceva",
    "alesiaskaz",
    "turned-off-laptop-computer-on-top-of-brown-wooden-table-VWcPlbHglYc",
  ],
  "1556761175-5973dc0f32e7": [
    "Austin Distel",
    "austindistel",
    "man-standing-in-front-of-group-of-men-rxpThOwuVgE",
  ],
  "1522202176988-66273c2fd55f": [
    "Brooke Cagle",
    "brookecagle",
    "three-people-sitting-in-front-of-table-laughing-together-g1Kr4Ozfoac",
  ],
  "1758876203195-69a51e4145f0": [
    "Vitaly Gariev",
    "silverkblack",
    "two-people-brainstorming-with-sticky-notes-on-wall-ynkz9cpyvzI",
  ],
  "1542744173-8e7e53415bb0": [
    "Campaign Creators",
    "campaign_creators",
    "man-standing-in-front-of-people-sitting-beside-table-with-laptop-computers-gMsnXqILjp4",
  ],
  "1600880292203-757bb62b4baf": [
    "krakenimages",
    "krakenimages",
    "man-in-white-dress-shirt-sitting-beside-woman-in-black-long-sleeve-shirt-376KN_ISplE",
  ],
  "1497032628192-86f99bcd76bc": [
    "ian dooley",
    "sadswim",
    "cup-of-coffee-near-macbook-pro-DJ7bWa-Gwks",
  ],
  "1434030216411-0b793f4b4173": [
    "Unseen Studio",
    "uns__nstudio",
    "person-writing-on-brown-wooden-table-near-white-ceramic-mug-s9CC2SKySJM",
  ],
  "1503387762-592deb58ef4e": [
    "Daniel McCullough",
    "d_mccullough",
    "an-architect-working-on-a-draft-with-a-pencil-and-ruler-HtBlQdxfG9k",
  ],
  "1551288049-bebda4e38f71": [
    "Luke Chesser",
    "lukechesser",
    "graphs-of-performance-analytics-on-a-laptop-screen-JKUTrJ4vK00",
  ],
  "1476365518243-f738bf58443d": [
    "Dawid Liberadzki",
    "dawidliberadzki",
    "silver-laptop-computer-on-table-vPFbVB7DPZI",
  ],
  "1511632765486-a01980e01a18": [
    "Helena Lopes",
    "helenalopesph",
    "four-person-hands-wrap-around-shoulders-while-looking-at-sunset-PGnqT0rXWLs",
  ],
  "1529156069898-49953e39b3ac": [
    "Duy Pham",
    "miinyuii",
    "people-holding-shoulders-sitting-on-wall-Cecb0_8Hx-o",
  ],
  "1488521787991-ed7bbaae773c": [
    "Larm Rmah",
    "larm",
    "five-children-smiling-while-doing-peace-hand-sign-AEaTUnvneik",
  ],
  "1540575467063-178a50c2df87": [
    "Headway",
    "headwayio",
    "crowd-of-people-sitting-on-chairs-inside-room-F2KRf_QfCqw",
  ],
  "1475721027785-f74eccf877e2": [
    "Kane Reinholdtsen",
    "kanereinholdtsen",
    "silver-corded-microphone-in-shallow-focus-photography-LETdkk7wHQk",
  ],
  "1501386761578-eac5c94b800a": [
    "Nicholas Green",
    "nickxshotz",
    "excited-crowd-cheering-at-concert-or-event-nPz8akkUmDI",
  ],
  "1669459868647-4c2f1c564052": [
    "Leon Rockel",
    "lonski",
    "a-crowd-of-people-in-a-room-with-a-stage-and-a-stage-T3L72nHQ6aQ",
  ],
  "1511671782779-c97d3d27a1d4": [
    "israel palacio",
    "othentikisra",
    "bokeh-photography-of-condenser-microphone-Y20JJ_ddy9M",
  ],
  "1465495976277-4387d4b0b4c6": [
    "Drew Coffman",
    "drewcoffman",
    "man-and-woman-holding-hands-llWjwo200fo",
  ],
  "1660286156087-911df708e663": [
    "Asdrubal luna",
    "infectedluna",
    "a-bride-and-groom-walking-down-the-aisle-n5xGMMSqLVQ",
  ],
  "1438761681033-6461ffad8d80": [
    "Christopher Campbell",
    "chrisjoelcampbell",
    "shallow-focus-photography-of-woman-outdoor-during-day-rDEOVtE7vOs",
  ],
  "1500648767791-00dcc994a43e": [
    "Jurica Koletić",
    "juricakoletic",
    "man-wearing-henley-top-portrait-7YVZYZeITc8",
  ],
  "1494790108377-be9c29b29330": [
    "Michael Dam",
    "michaeldam",
    "closeup-photography-of-woman-smiling-mEZ3PoFGs_k",
  ],
  "1507003211169-0a1dd7228f2d": [
    "Joseph Gonzalez",
    "miracletwentyone",
    "man-wearing-white-v-neck-shirt-iFgRcqHznqg",
  ],
  "1580489944761-15a19d654956": [
    "Jake Nackos",
    "jakenackos",
    "woman-in-white-crew-neck-shirt-smiling-IF9TK5Uy-KI",
  ],
  "1539571696357-5a69c17a67c6": [
    "ian dooley",
    "sadswim",
    "man-standing-near-white-wall-d1UPkiFd04A",
  ],
  "1534528741775-53994a69daeb": [
    "Aiony Haust",
    "aiony",
    "woman-wearing-black-crew-neck-shirt-3TLl_97HNJo",
  ],
  "1780387477222-730504564368": [
    "Centre for Ageing Better",
    "ageing_better",
    "woman-in-beige-jumpsuit-smiling-sitting-on-a-stool-IxacjtwPdGM",
  ],
  "1544005313-94ddf0286df2": [
    "Štefan Štefančík",
    "cikstefan",
    "smiling-woman-wearing-white-and-black-pinstriped-collared-top-QXevDflbl8A",
  ],
  "1573496359142-b8d87734a5a2": [
    "Christina @ wocintechchat.com M",
    "wocintechchat",
    "shallow-focus-photo-of-woman-in-gray-jacket-0Zx1bDv5BNY",
  ],
  "1560250097-0b93528c311a": [
    "LinkedIn Sales Solutions",
    "linkedinsalesnavigator",
    "man-standing-beside-wall-pAtA8xe_iVM",
  ],
  "1597696929736-6d13bed8e6a8": [
    "Chloe Bolton",
    "crystalmind_design",
    "ceramic-vases-on-wooden-surface-R0qthXq3jec",
  ],
  "1565193566173-7a0ee3dbe261": ["Tom Crew", "tomcrewceramics", "three-white-bottles-j6sxCTf3UyU"],
  "1513364776144-60967b0f800f": [
    "Anna Kolosyuk",
    "anko_",
    "three-silver-paint-brushes-on-white-textile-D5nh6mCW52c",
  ],
  "1513519245088-0e12902e5a38": [
    "Jonny Caspari",
    "jonnycspr",
    "assorted-color-framed-paintings-on-the-wall-KuudDjBHIlA",
  ],
  "1459411552884-841db9b3cc2a": [
    "Annie Spratt",
    "anniespratt",
    "green-cactus-plant-on-brown-pot-fbAnIjhrOL4",
  ],
  "1485955900006-10f4d324d411": [
    "Galina N",
    "galina88",
    "green-succulent-in-teal-ceramic-vase-miziNqvJx5M",
  ],
  "1466692476868-aef1dfb1e735": [
    "Markus Spiske",
    "markusspiske",
    "selective-focus-photo-of-plant-spouts-vrbZVyX2k4I",
  ],
  "1782386963665-b83ce1d6752e": [
    "Erwin Bosman",
    "erwinbosman",
    "hands-in-gloves-planting-small-seedlings-in-dark-soil-6xMClJG5dW8",
  ],
  "1456513080510-7bf3a84b82f8": ["Aaron Burden", "aaronburden", "opened-book-QJDzYT_K8Xg"],
  "1526170375885-4d8ecf77b99f": [
    "eniko kis",
    "enikoo",
    "white-and-black-polaroid-one-step-2-instant-camera-on-white-board-KsLPTsYaqIQ",
  ],
  "1505740420928-5e560c06d30e": [
    "C D-X",
    "cdx2",
    "flatlay-photography-of-wireless-headphones-PDX_a_82obo",
  ],
  "1523275335684-37898b6baf30": [
    "Rachit Tank",
    "rachitank",
    "round-white-watch-with-white-band-2cFZ_FB08UM",
  ],
  "1491553895911-0055eca6402d": [
    "Imani Bahati",
    "imani_bht",
    "unpaired-gray-nike-running-shoe-LxVxPA1LOVM",
  ],
  "1555529733-ba28d9c4587c": [
    "charlesdeluvio",
    "charlesdeluvio",
    "hanger-of-cloth-lot-sWiqbPItyg8",
  ],
  "1767605523281-8b54b3692078": [
    "Margaret Young",
    "wildsoulmagsyogi",
    "rolled-yoga-mats-in-a-decorative-basket-with-plants-OuMxVZS72N0",
  ],
  "1712168044214-f5a272c23a5b": [
    "Point Normal",
    "normals",
    "a-tube-of-cream-sitting-on-top-of-a-table-Xp0bTCLD07k",
  ],
  "1515377905703-c4788e51af15": [
    "Christin Hume",
    "christinhumephoto",
    "person-holding-amber-glass-bottle-0MoF-Fe0w0A",
  ],
  "1501854140801-50d01698950b": [
    "Qingbao Meng",
    "ideasboom",
    "birds-eye-view-photograph-of-green-mountains-01_igFr7hd4",
  ],
  "1441974231531-c6227db76b6e": ["Lukasz Szmigiel", "szmigieldesign", "forest-trees-jFCViYFYcus"],
  "1470071459604-3b5ec3a7fe05": ["v2osk", "v2osk", "foggy-mountain-summit-1Z2niiBPg5A"],
  "1543270915-a8381a52e201": ["Joel Vodell", "joelvodell", "person-walking-on-bridge-HoMw854Uya8"],
  "1465146344425-f00d5f5c8f07": ["enrico bet", "henry_be", "orange-flowers-IicyiaPYGGI"],
  "1490750967868-88aa4486c946": [
    "Sergey Shmidt",
    "monstercritic",
    "orange-petaled-flowers-koy6FlCCy5s",
  ],
  "1501785888041-af3ef285b470": [
    "Pietro De Grandi",
    "peter_mc_greats",
    "three-brown-wooden-boat-on-blue-lake-water-taken-at-daytime-T7K4aEPoGGk",
  ],
  "1783611066016-59e16b0ac1c8": [
    "Roger Benz",
    "robe76",
    "a-serene-mountain-lake-reflecting-majestic-peaks-and-green-forests-QMtI1dZ6KJM",
  ],
  "1506744038136-46273834b3fb": [
    "Bailey Zindel",
    "baileyzindel",
    "river-in-yosemite-valley-at-low-light-NRQV-hBF10M",
  ],
  "1507525428034-b723cf961d3e": [
    "Sean Oulashin",
    "oulashin",
    "seashore-during-golden-hour-KMn4VEeEPR8",
  ],
  "1518837695005-2083093ee35b": ["Matt Hardy", "matthardy", "body-of-water-under-sky-6ArTTluciuA"],
  "1505142468610-359e7d316be0": [
    "Shifaaz shamoon",
    "sotti",
    "aerial-photo-of-seashore-sLAk1guBG90",
  ],
  "1500530855697-b586d89ba3ee": [
    "Jake Blucker",
    "jakeblucker",
    "black-concrete-road-surrounded-by-brown-rocks-tMzCrBkM99Y",
  ],
  "1477959858617-67f85cf4f1df": [
    "Pedro Lastra",
    "peterlaster",
    "white-and-brown-city-buildings-during-daytime-Nyvq2juw4_o",
  ],
  "1449824913935-59a10b8d2000": [
    "Andrea Cau",
    "andreacau",
    "pathway-between-high-rise-buildings-nV7GJmSq3zc",
  ],
  "1487958449943-2429e8be8625": [
    "Lance Anderson",
    "lanceanderson",
    "rock-and-roll-hall-of-fame-cleveland-QdAAasrZhdk",
  ],
};

/** Image credits for every demo photo presets use (Unsplash License). */
export interface ImageCredit {
  key: PhotoKey;
  id: string;
  url: string;
  source: "Unsplash";
  license: "Unsplash License";
  licenseUrl: string;
  /** Photographer's name as shown on Unsplash. */
  author: string;
  /** Photographer's Unsplash profile. */
  authorUrl: string;
  /** The photo's page on Unsplash. */
  pageUrl: string;
  alt: string;
}

export const PRESET_IMAGE_CREDITS: readonly ImageCredit[] = (
  Object.entries(PHOTOS) as [PhotoKey, DemoPhoto][]
).map(([key, ph]) => {
  const credit = PHOTO_CREDITS[ph.id];
  if (!credit) throw new Error(`No photographer credit for ${key} (${ph.id})`);
  const [author, username, slug] = credit;
  return {
    key,
    id: ph.id,
    url: `https://images.unsplash.com/photo-${ph.id}`,
    source: "Unsplash",
    license: "Unsplash License",
    licenseUrl: "https://unsplash.com/license",
    author,
    authorUrl: `https://unsplash.com/@${username}`,
    pageUrl: `https://unsplash.com/photos/${slug}`,
    alt: ph.alt,
  };
});
