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
  spaStill: p(
    "1540555700478-4be289fbecef",
    3000,
    2000,
    "Rolled towels, a pump bottle and pink tulips on a white counter",
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
    "1517433670267-08bbd4be890f",
    4568,
    3401,
    "Bakery shelves stacked with baguettes and pastries behind the counter",
  ),
  cookies: p(
    "1499636136210-6f4ee915583e",
    2678,
    3349,
    "Chocolate chip cookies scattered on a pale linen cloth",
  ),
  cake: p(
    "1578985545062-69928b1d9587",
    2955,
    2173,
    "A chocolate layer cake piped with ganache on a cake stand",
  ),
  pancakes: p(
    "1567620905732-2d1ec7ab7445",
    4160,
    5027,
    "Syrup being poured over a tall stack of pancakes",
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
    "1554118811-1e0d58224f24",
    4032,
    2764,
    "A bright café interior with plants, a long counter and bistro tables",
  ),
  cafeSign: p(
    "1501339847302-ac426a4a7cbb",
    4591,
    3034,
    "Pendant lights glowing over a café wall painted with the word Cafe",
  ),
  // interiors & places
  livingRoom: p(
    "1524758631624-e2822e304c36",
    3762,
    2508,
    "A bright, airy lounge with pale chairs and a reading lamp",
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
    "1600585154340-be6161a56a0c",
    4500,
    3000,
    "A modern timber house glowing at dusk beneath a large tree",
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
  officeCalm: p(
    "1497366216548-37526070297c",
    2301,
    1536,
    "An empty open-plan office with a long pale corridor",
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
    "1552664730-d307ca884978",
    3600,
    2400,
    "A team planning with sticky notes on a glass wall",
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
    "1517694712202-14dd9538aa97",
    6000,
    4000,
    "A laptop with code on screen beside a small plant",
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
    "1516450360452-9312f5e86fc7",
    3000,
    2000,
    "A band on stage under magenta and blue lights",
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
    "1511285560929-80b456fea0bc",
    5960,
    3979,
    "A couple at the end of an outdoor aisle lined with flowers and balloons",
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
    "1472099645785-5658abf4ff4e",
    5760,
    3840,
    "Portrait of a grey-haired man with glasses in a green shirt",
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
    "1493106641515-6b5631de4bb9",
    5062,
    3031,
    "Clay-covered hands shaping a pot on a spinning wheel",
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
    "1416879595882-3373a0480b5b",
    4896,
    3264,
    "A garden trowel and a pot of soil ready for planting",
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
  shirts: p(
    "1523381210434-271e8be1f52b",
    7952,
    5304,
    "Sage-green t-shirts hanging in a row on wooden hangers",
  ),
  yogaMats: p(
    "1601925260368-ae2f83cf8b7f",
    3133,
    3133,
    "Rolled yoga mats in green and teal stacked in white cubbies",
  ),
  skincare: p(
    "1556228578-8c89e6adf883",
    3417,
    5126,
    "A skincare tube resting on sand among dried flowers",
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
    "1447752875215-b2761acb3c5d",
    5472,
    3648,
    "A wooden footbridge leading into a dense green forest",
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
    "1493246507139-91e8fad9978e",
    5472,
    3648,
    "Snow-dusted peaks glowing pink over a still mountain lake",
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

/** Image credits for every demo photo presets use (Unsplash License). */
export interface ImageCredit {
  key: PhotoKey;
  id: string;
  url: string;
  source: "Unsplash";
  license: "Unsplash License";
  licenseUrl: string;
  /** Photographer, when known; Unsplash's license does not require attribution. */
  author: string | null;
  alt: string;
}

export const PRESET_IMAGE_CREDITS: readonly ImageCredit[] = (
  Object.entries(PHOTOS) as [PhotoKey, DemoPhoto][]
).map(([key, ph]) => ({
  key,
  id: ph.id,
  url: `https://images.unsplash.com/photo-${ph.id}`,
  source: "Unsplash",
  license: "Unsplash License",
  licenseUrl: "https://unsplash.com/license",
  author: null,
  alt: ph.alt,
}));
