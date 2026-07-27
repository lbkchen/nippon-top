#!/usr/bin/env node
// Builds ../data.js from the master list below.
//   node tools/build-data.mjs            -> writes data.js using cached/fallback coords
//   node tools/build-data.mjs --geocode  -> refreshes coords via Nominatim (1 req/sec, cached)
//
// Every place has a `fallback` [lat, lng] (hand-placed, at least neighborhood-accurate).
// Coordinate sources, best first:
//   1. `gmaps` — a Google Maps share link. Resolving the shortlink (a plain HTTP
//      redirect, no API/key) yields a URL carrying the exact marker as !3d/!4d.
//      Cached in gmaps-cache.json so rebuilds stay offline.
//   2. `pin: true` — the fallback IS the answer; skip geocoding. For big areas
//      (parks, districts, mountain shrines) Nominatim returns the polygon
//      centroid, which lands up the mountain / in the empty half of the park.
//   3. Nominatim geocode, gated: per-category max drift from the fallback
//      (a restaurant "match" two districts over is a different restaurant) and
//      big-polygon hits are rejected in favor of the hand pin.
//   4. fallback + `approx: true` -> "~ish location" pill in the app.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(__dirname, "geocode-cache.json");
const OUT_PATH = join(__dirname, "..", "data.js");

// cat: food cafe night temple park hood shop museum view trip onsen fun
const PLACES = [
  // ---------------- WEST TOKYO ----------------
  { id: "kichijoji", name: "Kichijoji", star: true, region: "West Tokyo", group: "tokyo", cat: "hood",
    q: "Kichijoji Station, Musashino, Japan", fallback: [35.7032, 139.5797],
    notes: "Trendy neighborhood with lots of shops, largest UNIQLO, amazing restaurants, overall a very desirable place to live for the locals. Prominently featured in Persona 5R lol, it legit looks so similar once you walk out the station and see the open-air shopping street. For food I recommend Tsukemen Enji and Kooriya Peace (dessert)." },
  { id: "inokashira-park", name: "Inokashira Park", star: true, region: "West Tokyo", group: "tokyo", cat: "park",
    // geocode matched the west-garden annex, stacking this pin on the Ghibli museum
    q: "Inokashira Park, Musashino, Japan", fallback: [35.7003, 139.5731], pin: true,
    notes: "Big park next to Kichijoji and Ghibli museum, really nice to walk around and likely much less crowded/touristy, one of the nicest parks near tokyo IMO" },
  { id: "hikiniku-to-come", name: "Hikiniku to Come (hamburg)", star: true, region: "West Tokyo", group: "tokyo", cat: "food", emoji: "🍖",
    // 吉祥寺本町2-8-3 — tabelog pin, cross-checked
    q: "挽肉と米 吉祥寺", fallback: [35.70584, 139.57780], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("挽肉と米 吉祥寺"),
    notes: "One of the best pure meat experiences of my life. Only one thing on the menu, and that's how you know it's gonna be good - you just order how many patties you want, they grill em fresh for you, and you mix and match toppings to put on the meats. Unlimited refills of the fluffiest rice you'll ever have. Whole place smells like smoke but they give you a wardrobe to stuff your jacket in lol. Idk if they take resys now, we had to show up early morning for a same-day ticket and come back later. Worth the effort, and Kichijoji is S tier anyway so just spend the whole day there." },
  { id: "higashi-koganei", name: "Higashi Koganei", star: false, region: "West Tokyo", group: "tokyo", cat: "hood",
    q: "Higashi-Koganei Station, Koganei, Japan", fallback: [35.7014, 139.5261],
    notes: "Nothing crazy but it's a nice residential neighborhood if you want to experience some of that suburb life. Go to Kujira Shokudo for an amazing tsukemen - it's shoyu instead of fish based. Then explore the back alleys near the station for more food, izakaya (torikizoku), karaoke, etc." },
  { id: "ghibli-museum", name: "Ghibli Museum", star: true, region: "West Tokyo", group: "tokyo", cat: "museum", emoji: "🐉",
    q: "Ghibli Museum, Mitaka, Japan", fallback: [35.6962, 139.5704],
    notes: "Famous museum showcasing the Ghibli filmmaking process, amazing experience but hard to get tickets." },
  { id: "ramenya-shima", name: "Ramenya Shima", star: false, region: "Shinjuku/Shibuya Area", group: "tokyo", cat: "food",
    // the old q conflated 嶋 with らぁめん小池 (a different shop) and pinned Nishi-Ogikubo,
    // 7.7km off. real address: 渋谷区本町3-41-12, near Nishi-Shinjuku-Gochome stn
    q: "らぁ麺や 嶋 渋谷区本町", fallback: [35.68834, 139.68087], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("らぁ麺や 嶋 渋谷区本町"),
    notes: "Best shoyu ramen I've had. Super annoying to get in tho - 60 bowls a day, you must sign up at 8-9am at the door, then return at the predetermined time slot - see Goog reviews lol. Only for the real fans." },
  { id: "tonkatsu-narikura", name: "Tonkatsu Narikura", star: false, region: "West Tokyo", group: "tokyo", cat: "food",
    // post-2019 home: 杉並区成田東4-33-9, ~300m from Minami-Asagaya stn
    q: "とんかつ成蔵 成田東", fallback: [35.69771, 139.63875], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("とんかつ成蔵 成田東"),
    notes: "One of the highest rated tonkatsu (fried pork cutlet) on Tabelog the Japanese yelp. Usually everything is literally 3 stars or less, but this one has over 4 stars and tastes incredible -- you need to book a resy beforehand here: https://omakase.in/en/r/qw473765." },
  { id: "takaosan", name: "Takaosan", star: false, region: "West Tokyo", group: "tokyo", cat: "trip", emoji: "🥾",
    q: "Mount Takao, Hachioji, Japan", fallback: [35.6251, 139.2434],
    notes: "Great place to do a day trip and hike near Tokyo, a bit farther out as you take Chuo line to the end." },
  { id: "koenji", name: "Koenji", star: false, region: "West Tokyo", group: "tokyo", cat: "hood",
    q: "Koenji Station, Suginami, Japan", fallback: [35.7053, 139.6497],
    notes: "Recommended by GPT3 itself when I asked for cool vibes and not too many crowds. Apparently popular with the locals for shopping (esp vintage, bohemian...), good eats, and late nite activities. We ended up visiting and were shook by the sheer amount of vintage stores - Brooklyn ish vibes, full of small shops. Def one of the best places for thrifting with actually good prices. It's on the CHUO line, so if going here you can hit up all the spots on there (Kichijoji, Koenji, Asagaya)" },
  { id: "asagaya", name: "Asagaya", star: false, region: "West Tokyo", group: "tokyo", cat: "hood",
    q: "Asagaya Station, Suginami, Japan", fallback: [35.7048, 139.6357],
    notes: "Similar to Koenji but even less well-known, also a long ass shopping street, definitely not touristy at all, good for a chill vibes, shopping day." },

  // ---------------- SHINJUKU / SHIBUYA ----------------
  { id: "omoide-yokocho", name: "Omoide Yokocho", star: false, region: "Shinjuku/Shibuya Area", group: "tokyo", cat: "night",
    q: "Omoide Yokocho, Shinjuku, Japan", fallback: [35.6930, 139.6994],
    notes: "Also affectionately known as \"piss alley\", collection of narrow streets containing tiny counter-style bars / izakaya, etc. Good for bar hopping, fun to also just browse. Very touristy." },
  { id: "golden-gai", name: "Golden Gai", star: false, region: "Shinjuku/Shibuya Area", group: "tokyo", cat: "night",
    q: "Golden Gai, Shinjuku, Japan", fallback: [35.6944, 139.7046],
    notes: "Similar to Omoide Yokocho, maybe a little more touristy? Tiny streets and fun to walk around. It's a vibe. Very touristy, look at the japanese menu prices to not get scammed." },
  { id: "shinjuku-gyoen", name: "Shinjuku Gyoen", star: true, region: "Shinjuku/Shibuya Area", group: "tokyo", cat: "park", emoji: "🌸",
    q: "Shinjuku Gyoen, Tokyo, Japan", fallback: [35.6852, 139.7100],
    notes: "Huge park in central shinjuku. Some say it's overrated. It's the first place I went to with tons of cherry blossoms blooming in full force and it's such a sight esp being right next to the busy city. Really worth checking out." },
  { id: "shin-okubo", name: "Shin-Okubo area", star: false, region: "Shinjuku/Shibuya Area", group: "tokyo", cat: "hood", emoji: "🧋",
    q: "Shin-Okubo Station, Shinjuku, Japan", fallback: [35.7013, 139.7005],
    notes: "AKA Koreatown in Tokyo. Late night korean desserts like bingsoo and what not." },
  { id: "kabukicho", name: "Kabukicho", star: false, region: "Shinjuku/Shibuya Area", group: "tokyo", cat: "night",
    q: "Kabukicho, Shinjuku, Japan", fallback: [35.6952, 139.7028],
    notes: "Tokyo's red light district, worth a walk around night it's pretty wild just try to avoid eye contact with all the solicitors." },
  { id: "harajuku-cat-street", name: "Harajuku / Takeshita St / Cat St", star: false, region: "Shinjuku/Shibuya Area", group: "tokyo", cat: "shop",
    q: "Takeshita Street, Shibuya, Japan", fallback: [35.6716, 139.7031],
    notes: "Harajuku's main Takeshita street is EXTREMELY overrated IMO, but what's not overrated is dodging this hot mess and strolling through the side streets - I think the main one that goes to Shibuya is called Cat street. There are a lot of boutiques here and better small shops, as well as designer brands and consignment stores." },
  { id: "meiji-jingu", name: "Meiji Jingu / Yoyogi Park", star: false, region: "Shinjuku/Shibuya Area", group: "tokyo", cat: "temple",
    q: "Meiji Jingu, Shibuya, Japan", fallback: [35.6764, 139.6993],
    notes: "Famous shrine off of Harajuku. It's nothing too crazy but worth checking out if you plan to be here. Yoyogi park is a nice and very huge park in the area." },
  { id: "roastery-nozy", name: "The Roastery by Nozy Coffee", star: false, region: "Shinjuku/Shibuya Area", group: "tokyo", cat: "cafe",
    q: "The Roastery by Nozy Coffee, Jingumae, Japan", fallback: [35.6669, 139.7052], approx: true,
    notes: "Idk if I was just very new to coffee then but I had the single origin latte here and it was prob the best coffee I ever had at the time. Still think about it sometimes. Quite crowded but cute spot to sit down, walk the sidestreets around here too." },
  { id: "meguro-river", name: "Meguro / Meguro River", star: false, region: "Shinjuku/Shibuya Area", group: "tokyo", cat: "hood", emoji: "🌸",
    q: "Nakameguro Station, Meguro, Japan", fallback: [35.6440, 139.6982],
    notes: "Trendy and cute neighborhood to check out the cherry blossoms and walk along the river. Tsutakya books Daikanyama is also near by and worth checking out." },
  { id: "shibuya-crossing", name: "Shibuya Crossing", star: false, region: "Shinjuku/Shibuya Area", group: "tokyo", cat: "view", emoji: "🚦",
    q: "Shibuya Scramble Crossing, Tokyo, Japan", fallback: [35.6595, 139.7005],
    notes: "Just a classic place but worth checking out and doing the scramble, the classic 109 buldling (not worth visiting, only viewing from afar) and many malls in the area." },
  { id: "shimokitazawa", name: "Shimokitazawa", star: true, region: "Shinjuku/Shibuya Area", group: "tokyo", cat: "hood",
    q: "Shimokitazawa Station, Setagaya, Japan", fallback: [35.6613, 139.6682],
    notes: "Very trendy, hipster area. Similar to Koenji. Lots of nice thrift shops, bookstores, good vibes. Recommend just walking around and spending some time here chilling with a book or something!" },
  { id: "nagatanien-igamono", name: "Nagatanien Tokyo Store (igamono)", star: false, region: "Shinjuku/Shibuya Area", group: "tokyo", cat: "shop", emoji: "🍲",
    // 渋谷区恵比寿4-11-8 — hand-pinned off the address (they moved once, so if the
    // pin looks off, paste a fresh gmaps link in-app and it'll ride the geo overlay)
    q: "長谷園 東京店 igamono 恵比寿", fallback: [35.64550, 139.71180], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("長谷園 東京店 igamono 恵比寿"),
    notes: "A dream store for kitchen enthusiasts. They got famous from the Donabe cookbook, and sell a bunch of donabe pots from Iga prefecture which supposedly has the best clay and artisans that make this stuff. Small shop but really well curated and sells a bunch of other handcrafted ceramics, kitchen tools, etc. And worth a quick visit while in Ebisu." },
  { id: "kinto-store", name: "KINTO STORE Tokyo", star: false, region: "Shinjuku/Shibuya Area", group: "tokyo", cat: "shop", emoji: "🫖",
    // 目黒区青葉台1-19-12, ~6 min walk NW of Nakameguro stn up the Meguro river
    q: "KINTO STORE Tokyo 青葉台", fallback: [35.64690, 139.69630], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("KINTO STORE Tokyo 中目黒"),
    notes: "One of the flagship stores of Kinto which is a famous glassware and ceramics brand. Love their designs coffee mugs and matcha glasses, and they have a very comprehensive collection here. So much cheaper than the states too so grab some stuff here if you have the space." },
  { id: "jbs-tokyo", name: "JB's TOKYO (smash burger)", star: false, region: "Shinjuku/Shibuya Area", group: "tokyo", cat: "food", emoji: "🍔",
    // 渋谷区代々木1-33-3, the Yoyogi honten (there's a Miyashita Park branch too)
    q: "JB's TOKYO 代々木本店", fallback: [35.68370, 139.70130], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("JB's TOKYO 代々木本店"),
    notes: "The best smash burger I've had. Two patties with cheese on a milk bread, no frills place that emphasizes good ingredients and it definitely reflects in the taste." },
  { id: "amam-dacotan", name: "AMAM DACOTAN", star: false, region: "Shinjuku/Shibuya Area", group: "tokyo", cat: "cafe", emoji: "🥐",
    // 港区北青山3-7-6, just north of the Omotesando crossing
    q: "アマムダコタン 表参道", fallback: [35.66600, 139.71070], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("アマムダコタン 表参道"),
    notes: "An offshoot bakery of \"im donut?\" the legendary fluffy donut shop, this place is just as ridiculous and great. There are so many creative sweet and savory pastries here that are both aesthetic and tasty." },

  // ---------------- EAST TOKYO ----------------
  { id: "kuramae", name: "Kuramae", star: false, region: "East Tokyo", group: "tokyo", cat: "shop", emoji: "🧵",
    // the pin is the station on Edo-dori; the shops sprawl — see the Kuramae zone
    q: "Kuramae Station, Taito, Japan", fallback: [35.70530, 139.79130], pin: true,
    notes: "Right off of Asakusa the streets here are lined with great coffee shops and artisan stores. We were looking for a nice leather bag and just stumbled upon so many stores that sell unique artisan wares, like ceramics, leather goods, homeware, clothes, etc. These shops definitely have a much more curated collection from individual artists than the typical items you can also find at Loft, Kappabashi, etc. Lots of hidden gems if you're looking for that kind of stuff." },
  { id: "asakusa-sensoji", name: "Asakusa / Sensoji / Nakamise St", star: true, region: "East Tokyo", group: "tokyo", cat: "temple",
    q: "Sensoji, Asakusa, Japan", fallback: [35.7148, 139.7967],
    notes: "Traditional temple with a nice shopping street and more old-town vibes, although it be really touristy now. Most accesssible kyoto-like part of town I guess." },
  { id: "ueno-ameyoko", name: "Ueno / Ameyoko", star: false, region: "East Tokyo", group: "tokyo", cat: "shop",
    q: "Ameyoko, Taito, Japan", fallback: [35.7107, 139.7745],
    notes: "Cool, popular open air shopping district selling foods, fruits, vintage clothes and goods, etc. Fun to walk around and get some food in the area. Unlike Asakusa's shopping street, which is more targeted towards tourism, this one feels more catered to locals. Nearby Ueno park is also nice in Spring/Autumn for a quick stroll." },
  { id: "kamo-to-negi", name: "Ramen Kamo to Negi", star: true, region: "East Tokyo", group: "tokyo", cat: "food", emoji: "🦆",
    q: "鴨to葱 上野", fallback: [35.7079, 139.7749], approx: true,
    notes: "God ramen, the duck confit topping was so crazy good. Broth is very fragrant, and you get to choose 2 types of seasonal negis to pair it with. This is like fine dining at 1500 yen. One of our favs in Tokyo and we keep going back." },
  { id: "nezu-shrine", name: "Nezu Shrine", star: false, region: "East Tokyo", group: "tokyo", cat: "temple",
    q: "Nezu Shrine, Bunkyo, Japan", fallback: [35.7203, 139.7610],
    notes: "Close to the north part of Ueno park IIRC, very peaceful fairly small shrine with a bunch of Torii gates, like a mini-Fushimi Inari." },
  { id: "kappabashi", name: "Kappabashi", star: false, region: "East Tokyo", group: "tokyo", cat: "shop", emoji: "🔪",
    q: "Kappabashi Dougu Street, Taito, Japan", fallback: [35.7139, 139.7886],
    notes: "Every home cook's dream district - It's the restaurant supply district so this is where you can go to get your fancy Japanese knives and 1:1 plastic models of foods. I think the knife stores are super touristy now and not really that cheap, but still love shopping for all the other random stuff they have in this district." },
  { id: "skytree-solamachi", name: "Tokyo Skytree / Solamachi", star: false, region: "East Tokyo", group: "tokyo", cat: "view",
    q: "Tokyo Skytree, Sumida, Japan", fallback: [35.7101, 139.8107],
    notes: "One of the most famous places out in East Tokyo and a bit out of the way but honestly a beautiful area next to the canals. Idt it's super worth to go up the Skytree itself but it is one of the most shocking views of Tokyo that you can get out there. Solamachi is a giant mall connected to the skytree that's actually quite nice and has a great mix of everything - food, clothing, souvenirs, etc." },
  { id: "yakitori-omino", name: "Yakitori Omino", star: false, region: "East Tokyo", group: "tokyo", cat: "food", emoji: "🍢",
    // the original 押上1-38-4 shop (Kamiyacho branch is a different one)
    q: "焼鳥おみ乃 押上", fallback: [35.70987, 139.81590], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("焼鳥おみ乃 押上"),
    notes: "Delicious yakitori (chicken skewer) omakase place near Skytree. They serve you until you say stop so come v hungry and experience the great joy of binchotan charcoal grilled chicken parts. The catch is you gotta book like 2+ months in advance on Omakase (as of Mar '24)" },
  { id: "takesue", name: "Takesue Tokyo Premium (ramen)", star: false, region: "East Tokyo", group: "tokyo", cat: "food",
    // 業平5-14-7, ~350m SE of Skytree — tabelog pin
    q: "竹末東京Premium 押上", fallback: [35.70815, 139.81765], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("竹末東京Premium"),
    notes: "Awesome local shop, highly recommend the chicken scallop base, and it has the most delicious toppings." },
  { id: "leaves-coffee", name: "Leaves Coffee Roasters", star: false, region: "East Tokyo", group: "tokyo", cat: "cafe",
    q: "Leaves Coffee Roasters, Sumida, Tokyo, Japan", fallback: [35.7060, 139.7996],
    notes: "One of the most respected roasters in Tokyo alongside Glitch, they pay a ton of attention to their brewers and a lot of the good cafes around the city actually use their beans. Get the pour over. Pretty hard to get a seat tho and the line gets long, so show up early. If you're a real coffee geek this is the one for you." },
  { id: "koffee-mameya-kakeru", name: "Koffee Mameya Kakeru", star: false, region: "East Tokyo", group: "tokyo", cat: "cafe",
    q: "Koffee Mameya Kakeru, Koto, Tokyo, Japan", fallback: [35.6805, 139.8080],
    notes: "A real treat but also kind of a crazy experience, you have to be really into coffee AND experimentation because they do a whole course of coffee pairings with the food. Honestly a lot of the food pairings were not that good, but the sweets pairings were really good, and there was this orange + whiskey coffee cocktail that was one of the nicest drinks I've ever had. Reservation required - double check before you go." },
  { id: "tomita", name: "Chuka soba Tomita (ramen)", star: true, region: "East Tokyo (far-ish)", group: "tokyo", cat: "food", emoji: "🐐",
    // 松戸1339 高橋ビル, ~320m south of Matsudo stn (old pin sat on the station)
    q: "中華蕎麦とみ田 松戸", fallback: [35.78181, 139.90097], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("中華蕎麦とみ田 松戸"),
    notes: "GOAT ramen rated #1 in japan for several years. I booked relatively easily online thru Omakase. Was a wild experience you can feel the attention to every small detail. And you will also leave stuffed." },

  // ---------------- CENTRAL / NORTH / SOUTH TOKYO ----------------
  { id: "rokurinsha", name: "Rokurinsha", star: false, region: "Central Tokyo?", group: "tokyo", cat: "food",
    // Tokyo Ramen Street, B1 First Avenue, Yaesu south side
    q: "六厘舎 東京駅", fallback: [35.68006, 139.76785], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("六厘舎 東京ラーメンストリート"),
    notes: "Famous ramen restaurant right in Tokyo station, known for seafood-forward tsukemen with thicc noods." },
  { id: "kagari", name: "Kagari (ramen)", star: false, region: "Central Tokyo?", group: "tokyo", cat: "food",
    // 本店 moved to 銀座6-4-12 KNビル (Dec 2018) — building-exact via co-tenant's tabelog pin
    q: "銀座 篝 本店", fallback: [35.67098, 139.76109], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("銀座 篝 本店"),
    notes: "Main branch is in Ginza I think -- exists elsewhere. Otemachi has a larger one with 4 people seating, rest are mostly counter seats. BEST tori paitan I've ever had, strongly recommend." },
  { id: "uniqlo-ginza", name: "Uniqlo Ginza", star: false, region: "Central Tokyo?", group: "tokyo", cat: "shop",
    q: "Uniqlo Ginza, Tokyo, Japan", fallback: [35.6717, 139.7639],
    notes: "There are 2 giant Uniqlo's in Ginza and both are pretty interesting - one is the 12 floor HQ which is the one everyone goes to but the other one is also huge and has 3-4 very wide stories of a ton of goods which made it a much more enjoyable shopping experience." },
  { id: "tokyo-tower", name: "Tokyo Tower", star: false, region: "Central Tokyo?", group: "tokyo", cat: "view",
    q: "Tokyo Tower, Minato, Japan", fallback: [35.6586, 139.7454],
    notes: "Overrated - would not recommend this or Skytree. I think you can go to some tall buildings in Roppongi for a similar experience with the Tokyo tower in your view..." },
  { id: "garden-lounge", name: "Garden Lounge", star: false, region: "Central Tokyo?", group: "tokyo", cat: "cafe", emoji: "🍰",
    // New Otani "The Main" lobby floor, 紀尾井町4-1 (the garden it overlooks is the
    // hotel's own 400-year-old one, not Shinjuku Gyoen)
    q: "Garden Lounge, Hotel New Otani, Tokyo", fallback: [35.68104, 139.73410], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("ホテルニューオータニ ガーデンラウンジ"),
    notes: "AYCE dessert place with a sick view of the garden (Shinjuku Gyoen?). Have not been, it looks amazing." },
  { id: "akihabara", name: "Akihabara", star: false, region: "Central Tokyo?", group: "tokyo", cat: "fun", emoji: "🕹️",
    q: "Akihabara Station, Tokyo, Japan", fallback: [35.6984, 139.7731],
    notes: "Anime district, prepare to be overwhelmed. Themed/maid/cat/crazy cafes, electronics stores, collectible stores, this place has it all." },
  { id: "glitch-coffee", name: "Glitch Coffee (GLITCH TOKYO, Nihonbashi)", star: false, region: "Central Tokyo?", group: "tokyo", cat: "cafe",
    // 中央区日本橋本町1-1-3 立石本町ビル1F — the roastery flagship that opened Aug '25
    // (the original Glitch is still in Jimbocho if this pin ever looks wrong)
    q: "GLITCH TOKYO 日本橋本町", fallback: [35.68680, 139.77480], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("GLITCH TOKYO 日本橋本町"),
    notes: "The most hyped coffee spot in Japan - is it worth the hype? I had mild expectations but honestly it really delivered. Got the latte as I don't drink many pour overs and it was really balanced and I could taste all the tasting notes they had claimed. My favorite part though is how friendly they are with asking your preferences, guiding you through their bean selection and even letting you smell the bean samples before placing your order. Also bought a couple of jars of beans back (really small though, 100g) and they were both bangers." },
  { id: "nakiryu", name: "Nakiryu (ramen)", star: false, region: "North Tokyo", group: "tokyo", cat: "food",
    // 南大塚2-34-4 — mapion + tabelog agree
    q: "創作麺工房 鳴龍", fallback: [35.72868, 139.73035], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("創作麺工房 鳴龍"),
    notes: "Michelin star ramen (it's famous for tantanmen style), worth the 1 hr wait." },
  { id: "teamlab-planets", name: "teamLab Planets", star: false, region: "South Tokyo", group: "tokyo", cat: "museum", emoji: "🪩",
    q: "teamLab Planets, Koto, Japan", fallback: [35.6494, 139.7898],
    notes: "I only went to teamLab Borderless but it's closed now :( I think this place is similar. Cool interactive museum with a lot of lights and trippy experiences." },

  // ---------------- DAY TRIPS FROM TOKYO ----------------
  { id: "kamakura", name: "Kamakura", star: true, region: "South of Tokyo", group: "neartokyo", cat: "trip", emoji: "🗿",
    q: "Kamakura Station, Japan", fallback: [35.3192, 139.5467],
    notes: "1 hr away from Tokyo, really nice for a full day trip. Most Kyoto-like vibe near Tokyo with lots of traditional looking streets, temples, the Big Buddha statue, beaches, Enoshima island, etc." },
  { id: "nikko", name: "Nikko", star: true, region: "North of Tokyo", group: "neartokyo", cat: "trip",
    q: "Toshogu, Nikko, Japan", fallback: [36.7581, 139.5990],
    notes: "2 hrs away from Tokyo, great full day trip or even better stay the night. Has the coolest most lavish looking shrine (Toshogu) and the mausoleum of Tokugawa, lot's of history in this city. Onsen and also some small ski areas are possible nearby during winter." },
  { id: "fuji-q", name: "Fuji-Q Highland", star: false, region: "South of Tokyo", group: "neartokyo", cat: "fun", emoji: "🎢",
    q: "Fuji-Q Highland, Fujiyoshida, Japan", fallback: [35.4875, 138.7803],
    notes: "One of the top 2 amusement parks in Japan. You would think the rides in a Japanese park would be tame - I definitely did, and how WRONG I was. There is one coaster \"eejanaika?\" that literally spins you upside down first before dropping you down what felt like a hundred feet down and I was completely and utterly unprepared with how serious these coasters are. Also you can pay to win $20 to skip each line at this place which just made it a very fun and efficient experience. Also recommend the impossible games \"ride\" which is like a minigame gauntlet really fun to run with friends." },
  { id: "hakone", name: "Hakone", star: false, region: "South of Tokyo", group: "neartokyo", cat: "onsen",
    q: "Hakone-Yumoto Station, Japan", fallback: [35.2324, 139.1069],
    notes: "1 hr away from Tokyo. Very famous for ryokan (traditional hotels), onsen, great natural scenery. Good place to splurge on a nice ryokan with kaiseki ryori (multi-course dinner and breakfast included with stay)." },
  { id: "mt-fuji", name: "Mt Fuji", star: false, region: "South of Tokyo", group: "neartokyo", cat: "trip", emoji: "🗻",
    q: "Mount Fuji, Japan", fallback: [35.3606, 138.7274],
    notes: "1-2hr away from Tokyo. Everyone knows what it looks like but it's worth doing the hike during the summer when hiking season is open. Pretty surreal sights on top." },
  { id: "yokohama", name: "Yokohama", star: false, region: "South of Tokyo", group: "neartokyo", cat: "trip", emoji: "🍜",
    q: "Minato Mirai, Yokohama, Japan", fallback: [35.4573, 139.6339],
    notes: "1 hr away from Tokyo, famous Cup noodle museum and big Chinatown." },

  // ---------------- KYOTO ----------------
  { id: "kiyomizudera", name: "Kiyomizudera (temple)", star: true, region: "Kyoto", group: "kyoto", cat: "temple",
    q: "Kiyomizu-dera, Kyoto, Japan", fallback: [34.9949, 135.7850],
    notes: "One of the most famous views in Kyoto (hopefully it's not still under renovation), and obv incredibly touristy. Still incredibly worth it, go early in the morning at like 6am and beat the crowds, get a goshuin (temple stamp), then come down after walking through the temple to explore the shopping district right at the foot of the temple complex, lots of good food and snacks, also famous for ceramic/stoneware so a good place to buy a souvenir since it used to be a district of potters." },
  { id: "fushimi-inari", name: "Fushimi Inari Shrine", star: false, region: "Kyoto", group: "kyoto", cat: "temple", emoji: "🦊",
    // geocode = centroid of the whole shrine grounds, 640m up Mount Inari; fallback = the entrance
    q: "Fushimi Inari Taisha, Kyoto, Japan", fallback: [34.9671, 135.7727], pin: true,
    notes: "The classic thousand-rows of orange torii gates -- extremely touristy and probably the most crowded shrine during peak travel season but a must see at least once, go early in the morning for the best experience and make sure to hike to the top." },
  { id: "arashiyama", name: "Arashiyama", star: true, region: "Kyoto", group: "kyoto", cat: "park", emoji: "🎋",
    q: "Arashiyama Bamboo Grove, Kyoto, Japan", fallback: [35.0170, 135.6710],
    notes: "Famous for the bamboo forest but boy is it crowded there. I would go very early like 6am if you care about avoiding crowds, but in general the surrounding area is super worth walking or biking around too. There are beautiful mountain landscapes and traditional looking streets here, and plenty of temples and shrines. If you only care about the bamboo forest there is an equally good, lesser known one at Adashino Nenbutsuji (15 min away by rental bike)" },
  { id: "monkey-park", name: "Arashiyama Monkey Park", star: true, region: "Kyoto", group: "kyoto", cat: "fun", emoji: "🐒",
    // geocode = mid-mountain centroid; fallback = the ticket gate by the river where you actually start
    q: "Iwatayama Monkey Park, Kyoto, Japan", fallback: [35.0128, 135.6778], pin: true,
    notes: "MONKEYS ROAMING FREE, on top of a mountain, roughly 20 min hike but worth it. Don't give up, you can do it!!!" },
  { id: "nisonin-gioji", name: "Nisonin temple / Gioji", star: false, region: "Kyoto", group: "kyoto", cat: "temple",
    q: "Nison-in, Kyoto, Japan", fallback: [35.0230, 135.6672],
    notes: "Famous temples near Arashiyama, all worth visiting and if you like collecting, start a book of goshuin (handwritten temple stamps)" },
  { id: "adashino-otagi", name: "Adashino Nenbutsuji / Otagi", star: true, region: "Kyoto", group: "kyoto", cat: "temple", emoji: "🪨",
    q: "Otagi Nenbutsu-ji, Kyoto, Japan", fallback: [35.0316, 135.6612],
    notes: "From Arashiyama, a bit of a walk. But if you're bummed by all the crowds there go here to see another bamboo forest away from all the hubbub. The latter is prob my favorite lesser-known temple in Japan for the unique mini stone statues and the cool history. Best way to explore is to rent a bike from Arashiyama - super relaxing way to spend the day." },
  { id: "ginkakuji", name: "Ginkakuji / Kinkakuji", star: false, region: "Kyoto", group: "kyoto", cat: "temple",
    q: "Ginkaku-ji, Kyoto, Japan", fallback: [35.0270, 135.7982],
    notes: "Famous temples but the golden temple is a bit overrated, silver temple was more memorable for me. The Philosophers Path near Ginkakuji (silver temple) is a famous cherry blossoms viewing spot." },
  { id: "ikazuchi-udon", name: "Ikazuchi Udon", star: false, region: "Kyoto", group: "kyoto", cat: "food", emoji: "⚡",
    // official spelling イカヅチうどん — 浄土寺西田町82-6, mapion pin
    q: "イカヅチうどん 京都", fallback: [35.02809, 135.78970], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("イカヅチうどん 京都"),
    notes: "Near Ginkakuji (silver temple) nice for a quick stop. I don't usually like udon much but this is the best udon I've had. Rec getting the one with kitsune (big fried tofu), beef, and kujo negis (local specialty) https://g.co/kgs/AkyD6ZR" },
  { id: "kifune", name: "Kifune", star: false, region: "North of Kyoto", group: "kyoto", cat: "trip",
    q: "Kifune Shrine, Kyoto, Japan", fallback: [35.1216, 135.7629],
    notes: "Day trip from Kyoto, another place famous for ryokan and kaiseki ryori, and you can also try nagashi somen (noodles that flow down a bamboo stalk and you catch it with your chopsticks lol). Beautiful shrine to visit here." },
  { id: "murin-an", name: "Murin-an", star: false, region: "Kyoto", group: "kyoto", cat: "park",
    q: "Murin-an, Kyoto, Japan", fallback: [35.0113, 135.7900],
    notes: "Beautiful Japanese style garden, not a popular or touristy place but really nice place to relax." },
  { id: "nishiki-market", name: "Nishiki Market", star: false, region: "Central Kyoto", group: "kyoto", cat: "shop",
    q: "Nishiki Market, Kyoto, Japan", fallback: [35.0050, 135.7649],
    notes: "Shopping arcade adjacent(?) to Gion, mostly for seafood and food stands but also a ton of clothing shops and other smaller souvenir shops. Pretty touristy. Better to go earlier in the day bc it closes at 6pm." },
  { id: "gion-shijo", name: "Gion / Shijo", star: false, region: "Central Kyoto", group: "kyoto", cat: "hood",
    // district centroid drifts east into Higashiyama; fallback = Hanamikoji where you'd start
    q: "Gion, Kyoto, Japan", fallback: [35.0037, 135.7752], pin: true,
    notes: "Famous shopping arcade popular with tourists. Near the center of it in the north-south canals is Pontocho which is known as the red light district in Kyoto, where you can find izakaya and night life. Unclear if we faced subtle racism here 🙃" },
  { id: "nara", name: "Nara", star: true, region: "Near Kyoto", group: "kyoto", cat: "trip", emoji: "🦌",
    // park centroid is 1.1km east in the empty grass; fallback = Todaiji/deer central
    q: "Nara Park, Nara, Japan", fallback: [34.6851, 135.8430], pin: true,
    notes: "Famous for the DEER, but also the big buddha probably the biggest I've ever seen. One of the former capitals so lots of history. Maybe the YT famous mochi pounding guy is still there too check him out (Nakatanidou)." },
  { id: "uji", name: "Uji", star: false, region: "Near Kyoto/Osaka", group: "kyoto", cat: "trip", emoji: "🍵",
    q: "Byodo-in, Uji, Japan", fallback: [34.8894, 135.8074],
    notes: "The home of MATCHA and hojicha, must go if you're into this stuff, and on the way to Nara from Kyoto. Theres matcha everything, from drinks to soft serve to soba to gyoza to everything you can think of. There are tourist traps as well as actually good tea shops, defintiely try to buy some good quality tea from here." },
  { id: "kobe", name: "Kobe", star: false, region: "Near Kyoto", group: "kyoto", cat: "trip", emoji: "🥩",
    q: "Sannomiya Station, Kobe, Japan", fallback: [34.6947, 135.1943],
    notes: "Great daytrip from Kyoto, also if you love beef." },
  { id: "miyama", name: "Miyama Kayabuki No Sato", star: false, region: "Nearish Kyoto", group: "kyoto", cat: "trip", emoji: "🛖",
    q: "Kayabuki no Sato, Miyama, Nantan, Japan", fallback: [35.3159, 135.6039],
    notes: "Historic idyllic rural location with thatched roof homes. If you want to check out the rural life, you should stay a night here in one of them and eat a meal prepared from local ingredients. A bit harder to do without a Japanese speaker." },
  { id: "amanohashidate", name: "Amanohashidate", star: false, region: "Nearish Kyoto", group: "kyoto", cat: "trip",
    q: "Amanohashidate, Miyazu, Japan", fallback: [35.5697, 135.1904],
    notes: "One of the four great views of Japan or something like that, I didn't actually go but it was high on my bucket list, as is Ine the quaint fishing town north of it. Worth checking out together." },

  // ---------------- OSAKA ----------------
  { id: "dotonbori", name: "Dotonbori", star: false, region: "Osaka", group: "osaka", cat: "night", emoji: "🏃",
    q: "Dotonbori, Osaka, Japan", fallback: [34.6687, 135.5013],
    notes: "I honestly don't remember too much specific stuff about Osaka but generally the people there are friendly and way more talkative than ppl in Tokyo. Dotonbori is like the Kabukicho of Osaka, really lively night scene, tons of great food like kushikatsu, okonomiyaki, etc." },
  { id: "okonomiyaki-chitose", name: "Okonomiyaki Chitose", star: false, region: "Osaka", group: "osaka", cat: "food",
    // official spelling ちとせ (千とせ is the unrelated namba nikusui shop) —
    // 西成区太子1-11-10, 1 min from Dobutsuen-mae exit 2
    q: "お好み焼き ちとせ 西成", fallback: [34.6475, 135.5047], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("お好み焼き ちとせ 西成区"),
    notes: "Really great okonomiyaki, osaka style. There are tons of other places too just make sure to try it once in Osaka and Hiroshima if you go there too the styles are different." },
  { id: "osaka-castle", name: "Osaka Castle", star: false, region: "Osaka", group: "osaka", cat: "view", emoji: "🏯",
    q: "Osaka Castle, Osaka, Japan", fallback: [34.6873, 135.5262],
    notes: "Impressive castle worth checking out, idr much else lol." },
  { id: "onigiri-gorichan", name: "Onigiri Gorichan", star: false, region: "Osaka", group: "osaka", cat: "food", emoji: "🍙",
    q: "おにぎり ゴリちゃん 大阪", fallback: [34.6960, 135.4740], approx: true,
    gmaps: "https://maps.app.goo.gl/5Dns7DF72VFs3bBh7",
    notes: "We waited 30m for this but was worth it - massive onigiri with whatever toppings you want. The unagi egg yolk one was so bomb. Staff were over the top friendly. https://maps.app.goo.gl/5Dns7DF72VFs3bBh7" },
  { id: "kadoya-shokudo", name: "Kadoya Shokudo (ramen)", star: false, region: "Osaka", group: "osaka", cat: "food",
    q: "カドヤ食堂 総本店 大阪", fallback: [34.6746, 135.4900], approx: true,
    gmaps: "https://maps.app.goo.gl/9kqMv22NRTNuiWrG8",
    notes: "Top rated ramen on tabelog in Osaka/Kyoto. Lots of locals, shoyu base, on the salty side but super flavorful. I would recommend the tsukemen which I saw all the locals getting: https://maps.app.goo.gl/9kqMv22NRTNuiWrG8" },
  { id: "omoroi-sports", name: "Omoroi Sports", star: false, region: "Osaka", group: "osaka", cat: "fun", emoji: "🏐",
    q: null, fallback: [34.6690, 135.5000], approx: true,
    notes: "IF you want to play volleyball or any other sports while in Osaka lol, highly recommend booking a spot here! Most sessions are open to all levels, mostly international so English speaking, mix of locals and foreigners, and everyone is super friendly. Sometimes we went to izakaya together after playing. https://omoroi-life.com/ (Sessions happen at gyms around the city - pin is symbolic.)" },
  { id: "mount-koya", name: "Mount Koya", star: true, region: "Near Osaka", group: "osaka", cat: "temple", emoji: "⛰️",
    q: "Okunoin, Koya, Japan", fallback: [34.2130, 135.5837],
    notes: "An hour or so away from Osaka, it's a temple complex in the mountains worth spending a day visiting. You can check out the mausoleum and there are even overnight temple stays you can do here. From one of the temples here you can get a sacred cedar wood goshuincho which is the book you use to collect temple stamps and it's one of the coolest souvenirs you can take from Japan." },

  // ---------------- HIROSHIMA ----------------
  { id: "shimanami-kaido", name: "Shimanami Kaido", star: true, region: "Hiroshima", group: "hiroshima", cat: "fun", emoji: "🚴",
    q: "Onomichi Station, Japan", fallback: [34.4049, 133.1937],
    notes: "Must do if you're ever near Hiroshima, a 70km perfectly paved biking trail across 7 islands in Shikoku. You can experience something different on every island so I recommend taking it slow and spending a night on one of the islands in between, but you can finish it in a day if you're fast. Try Onomichi ramen at the starting point, and once you reach Imabari (I think it's known for towels?? lol), you can take a bus ride back to the beginning :)" },
  { id: "itsukushima", name: "Itsukushima", star: false, region: "Hiroshima", group: "hiroshima", cat: "temple",
    q: "Itsukushima Shrine, Hatsukaichi, Japan", fallback: [34.2960, 132.3198],
    notes: "Probably the most famous shrine in Hiroshima area because it looks like it's floating on the water. Hopefully it's no longer under renovation. Worth also getting all the maple-flavored snacks and doing the hike up the mountain here." },
  { id: "hiroshima-peace-museum", name: "Hiroshima Peace Memorial Museum", star: false, region: "Hiroshima", group: "hiroshima", cat: "museum",
    q: "Hiroshima Peace Memorial Museum, Japan", fallback: [34.3917, 132.4531],
    notes: "Incrediblly curated museum on the history of the event, 100% worth visiting if you're here." },

  // ---------------- KYUSHU ----------------
  { id: "fukuoka", name: "Fukuoka", star: false, region: "Fukuoka", group: "kyushu", cat: "hood",
    // pin = Tenjin, the city's centre of gravity; the honest take is in the zone too
    q: "Tenjin Station, Fukuoka, Japan", fallback: [33.59140, 130.39860], pin: true,
    notes: "Honestly, not really an anti-rec, but we didn't think it was super special, compared to other big cities like Osaka, Sapporo and Tokyo. People are really nice, similar to Osaka, but there are just not as many things to do in the city itself and it feels pretty uniform, unlike Tokyo which is just filled with microcosms, etc. Maybe the best way to experience this area is to get a car and go all around neighboring areas like Itoshima (boonies), Beppu, etc." },
  { id: "nakasu", name: "Nakasu", star: false, region: "Fukuoka", group: "kyushu", cat: "night",
    // the sandbank island between the Naka and Hakata rivers — see the avoid zone
    q: "Nakasu, Hakata, Fukuoka, Japan", fallback: [33.59250, 130.40480], pin: true,
    notes: "Not necessarily to be avoided because I think all the yatai night stands and lots of good restaurants are around there but it's comparable to Kabukicho in Tokyo. Very strange area - you will quickly notice there a bunch of these \"FREE INFORMATION CENTERS\" everywhere and it may seem like tourist centers. However, they are actually touts that will sell you escort services lol." },
  { id: "uminonakamichi", name: "Uminonakamichi Seaside Park", star: false, region: "Fukuoka", group: "kyushu", cat: "park", emoji: "🌼",
    // 東区西戸崎18-25 — huge park on the sandbar, pinned at the main gate by the
    // station (a geocode centroid lands somewhere in the middle of the flower fields)
    q: "海の中道海浜公園", fallback: [33.66400, 130.34700], pin: true,
    notes: "Really idyllic and huge park, almost too expansive to walk so would recommend renting a bike there to get around. A bit empty when we went but one of the more memorable sites from our Fukuoka stay in general. There were these huge blue flower fields that felt pretty otherworldly and various ruin-looking structures that just gave it quite the unique vibe for Japan." },
  { id: "nanzoin", name: "Nanzoin Temple", star: false, region: "Fukuoka", group: "kyushu", cat: "temple", emoji: "🛌",
    // 糟屋郡篠栗町篠栗1035, right by Kido-Nanzoin-mae stn on the Sasaguri line
    q: "南蔵院 篠栗", fallback: [33.59280, 130.52320], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("南蔵院 篠栗"),
    notes: "The famous reclining Buddha temple - it's definitely striking. One of the most touristy spots but it was quite memorable. There were some fun activities at this temple too like a ring tossing game and a special DIY goshuin (temple stamp)." },
  { id: "itoshima", name: "Itoshima", star: false, region: "Near Fukuoka", group: "kyushu", cat: "trip", emoji: "🌾",
    // pin = Chikuzen-Maebaru stn, the way in; the peninsula itself is a zone
    q: "Chikuzen-Maebaru Station, Itoshima, Japan", fallback: [33.55780, 130.19530], pin: true,
    notes: "Idyllic spot in the boonies off of Fukuoka. Conveniently it's right on the line that goes to the Hakata airport, so actually quite easy to get to. Some of the landscapes here are really insane too, like rolling golden rice fields with just a single locomotive track running through. Unfortunately due to the lack of infrastructure we think we got Shigella here but it was quite the experience." },

  // ---------------- HOKKAIDO ----------------
  { id: "donguri", name: "Donguri (bakery)", star: false, region: "Sapporo", group: "hokkaido", cat: "cafe", emoji: "🥟",
    // 大通西1丁目13 ル・トロワ1F — the Odori branch, one of many across the city
    q: "どんぐり 大通店 札幌", fallback: [43.06130, 141.35560], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("どんぐり 大通店 札幌"),
    notes: "I think this is a chain bakery all over Sapporo but they have this meat bun that was so good especially in the freezing winter that I am still thinking about it to this day." },
  { id: "poool", name: "poool - Espresso&Work", star: false, region: "Sapporo", group: "hokkaido", cat: "cafe",
    // 中央区北2条西3丁目1-29 タケサトビル1F, ~2 min from Chi-Ka-Ho exit 3
    q: "poool Espresso&Work 札幌", fallback: [43.06360, 141.35220], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("poool Espresso&Work 札幌"),
    notes: "Very cool cafe and coworking space with a great vibe. Definitely recommend if you need to get some work done" },
  { id: "otaru", name: "Otaru", star: false, region: "Hokkaido (West)", group: "hokkaido", cat: "trip", emoji: "🛶",
    // the canal, not the station — the canal IS the reason you go
    q: "Otaru Canal, Japan", fallback: [43.19880, 141.00160], pin: true,
    notes: "A really cute European-inspired town lined with canals worth a quick day trip from Sapporo, beautiful in both summer and winter." },
  { id: "niseko", name: "Niseko", star: false, region: "Hokkaido (West)", group: "hokkaido", cat: "fun", emoji: "🎿",
    q: "Niseko Hirafu, Kutchan, Japan", fallback: [42.86130, 140.69050], pin: true,
    notes: "We spent over a week there in January next to Hirafu and got a bit unlucky with the weather. Snow was a bit sparse and it was still really really busy, like the line to the main gondola felt like it stretched for miles. Also the entire city, from staff to tourists, is basically Australia. I've heard good things about Rusutsu nearby but I would personally recommend Nozawa Onsen instead, which has a much more cozy vibe." },
  { id: "r-niseko", name: "Pizzeria \"R Niseko\"", star: false, region: "Hokkaido (West)", group: "hokkaido", cat: "food", emoji: "🍕",
    // ニセコひらふ1条4-5-41, The Maples Niseko 1F — pin estimated off the block, so
    // it's upper-Hirafu-accurate rather than door-accurate
    q: "Pizzeria R Niseko ひらふ", fallback: [42.85980, 140.69180], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("Pizzeria R Niseko The Maples ひらふ"),
    notes: "This is probably outrageous but I think the Bismarck pizza (red sauce with cracked eggs in the center) is one of the best pizzas I've had. And it's from a random no-name pizza spot in Niseko of all places. I'm still thinking about that one." },
  { id: "lake-toya", name: "Lake Toya", star: false, region: "Hokkaido (West)", group: "hokkaido", cat: "onsen", emoji: "🏞️",
    q: "Toyako Onsen, Japan", fallback: [42.5657, 140.8195],
    notes: "Beautiful lake and a very popular stop on the way from Sapporo. Great place to stay in a ryokan - would recommend the Lake Suite Ko No Sumika." },
  { id: "soup-curry-mogmog", name: "Soup Curry MogMog", star: false, region: "Hokkaido (West)", group: "hokkaido", cat: "food", emoji: "🍛",
    // 洞爺湖温泉124-4, anchored off the neighboring shinkin bank (±100m — the one
    // researched pin that's estimated; a gmaps share link would lock it exactly)
    q: "soup curry mog mog 洞爺湖", fallback: [42.5640, 140.8210], pin: true,
    gmaps: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent("soup curry mog mog 洞爺湖温泉"),
    notes: "Legendary soup curry place (Hokkaido speciality I think), must go if you're around Lake Toya." },
  { id: "noboribetsu", name: "Noboribetsu", star: false, region: "Hokkaido (West)", group: "hokkaido", cat: "onsen",
    q: "Jigokudani, Noboribetsu, Japan", fallback: [42.4995, 141.1475],
    notes: "" },
  { id: "onuma-park", name: "Onuma Quasi-National Park", star: false, region: "Hokkaido (West)", group: "hokkaido", cat: "park",
    q: "Onuma Quasi-National Park, Japan", fallback: [41.9791, 140.6699],
    notes: "Love that this is a \"quasi-national\" park - went here instead of Lake Toya. Very peaceful, spent like 2-3 hours here." },
  { id: "mt-hakodate", name: "Mt. Hakodate Observatory", star: false, region: "Hokkaido (West)", group: "hokkaido", cat: "view",
    q: "Mount Hakodate Ropeway, Hakodate, Japan", fallback: [41.7590, 140.7047],
    notes: "It's a famous view but overrated - the view of Hakodate is pretty cool but honestly is it as cool as Tokyo? Nawwww" },
];

// Chains: recs that are everywhere, so they get a drawer instead of a pin.
const CHAINS = [
  { name: "Torikizoku", emoji: "🐔", notes: "Cheap izakaya yakitori restaurant. Don't expect michelin cuisine but you can't beat 300 yen for all drinks and entrees. Really fun place to go with your friends to pregame karaoke ;)" },
  { name: "7/11, Famima, Lawson", emoji: "🏪", notes: "Things to try: Fami-chiki (fried chicken thigh at family mart, honestly so addictive), Karaage-kun at Lawson not as good tho, various seasonal onigiri - my fave one is the soy sauce one with a half soy egg that you can get from 7/11" },
  { name: "Don Quijote", emoji: "🐧", notes: "You must go into one at least once to get all of your senses assaulted with pure maximalism and discount advertising. (It's a discount store that sells everything but probably the best thing to buy is cosmetics)." },
  { name: "Hands / Loft", emoji: "🎁", notes: "One of the best places to buy souvenirs, cute gifts, fun \"made in Japan\" stuff" },
  { name: "Coco Ichibanya", emoji: "🍛", notes: "Biggest curry chain in the world, it's cheap but it's LEGIT. Katsu curry is da bomb." },
  { name: "Nakau", emoji: "🍚", notes: "Ended up being one of our gotos - similar fast food exp to Yoshinoya etc. but serving mostly oyakodon - chicken egg bowls, incredible bang for ur buck" },
  { name: "Karaoke (Manekineko, Karaoke-kan, Jankara...)", emoji: "🎤", notes: "U just gotta try it in JP - ask for the LiveDAM system and queue up the AI to get graded on ur singing." },
  { name: "Taiyo no Tomatomen", emoji: "🍅", notes: "Tomato-broth based ramen with cheese/egg/meat toppings - can be polarizing, but for some it is life changing." },
  { name: "Taito Station / Arcades", emoji: "👾", notes: "There are a ton of arcades everywhere not necessarily just Taito Station. Some of our fav games: Taiko (drums!), DDR, Chunithm (music piano like game), punching game, house of the dead, etc." },
  { name: "Ginza Karen", emoji: "🧳", notes: "If you shopped too hard and need a $40 giant suitcase to bring everything back, this is it" },
];

// Hand-drawn starter "ski map" zones. More can be drawn in-app with the lasso.
const ZONES = [
  { id: "chuo-line", name: "Chuo Line Cool Zone", color: "#e8590c",
    blurb: "Vintage shops, tsukemen, and zero tourists. Ride the orange line, get off anywhere.",
    points: [[35.717, 139.515], [35.719, 139.575], [35.716, 139.612], [35.713, 139.655], [35.694, 139.657], [35.690, 139.612], [35.688, 139.565], [35.690, 139.520]] },
  { id: "shitamachi", name: "Old Tokyo Zone", color: "#9c36b5",
    blurb: "Sensoji, knife street, god-tier ramen. Maximum old-town energy per square meter.",
    points: [[35.727, 139.760], [35.725, 139.800], [35.716, 139.822], [35.703, 139.818], [35.700, 139.772], [35.706, 139.757]] },
  { id: "arashiyama-crawl", name: "Arashiyama Temple Crawl", color: "#2f9e44",
    blurb: "Rent a bike, collect goshuin, befriend monkeys. Go at 6am or perish in the crowds.",
    points: [[35.038, 135.655], [35.034, 135.672], [35.024, 135.683], [35.010, 135.681], [35.008, 135.667], [35.019, 135.657], [35.030, 135.653]] },
  // avoid: true = tourist-trap warning zones. kept tight — blocks, not districts.
  { id: "kabukicho-gauntlet", name: "Kabukicho Tout Gauntlet", color: "#e03131", avoid: true,
    blurb: "Walk it once at night for the neon, say yes to absolutely no one. Every \"free drink\" costs 10man.",
    points: [[35.6963, 139.7003], [35.6961, 139.7025], [35.6960, 139.7043], [35.6948, 139.7044], [35.6937, 139.7041], [35.6937, 139.7022], [35.6938, 139.7005], [35.6951, 139.7002]] },
  { id: "takeshita-crush", name: "Takeshita St Crush", color: "#e03131", avoid: true,
    blurb: "Shoulder-to-shoulder crepe purgatory. One block south is freedom — see Cat Street.",
    points: [[35.6708, 139.7027], [35.6712, 139.7046], [35.6717, 139.7064], [35.6711, 139.7068], [35.6706, 139.7047], [35.6701, 139.7029]] },
  { id: "kuramae-artisan", name: "Kuramae Maker Blocks", color: "#1098ad", fill: "dots",
    blurb: "Leather, ceramics, coffee, one-person studios. Wander Edo-dori to the river and let the shop fronts mug you.",
    // 蔵前 1–4 chome: Kuramabashi-dori (N) → Asakusa-dori (S), Kokusai-dori (W) → the Sumida (E)
    points: [[35.7085, 139.7885], [35.7088, 139.7930], [35.7072, 139.7945], [35.7040, 139.7940], [35.7028, 139.7915], [35.7032, 139.7884], [35.7058, 139.7876]] },
  { id: "nakasu-touts", name: "Nakasu Info Center Gauntlet", color: "#e03131", avoid: true,
    blurb: "Every \"FREE INFORMATION CENTER\" is a tout selling escorts, not maps. Eat at the yatai, decline everything else.",
    // the sandbank island between the Naka (W) and Hakata (E) rivers, north tip at
    // Nakasu-Kawabata stn down to the Haruyoshi end — ~1km long, ~250m wide
    // (north tip runs a touch past the Hakata river so the Kawabata stn exits, where
    // the touts wait for you, are inside)
    points: [[33.5968, 130.4082], [33.5946, 130.4100], [33.5918, 130.4068], [33.5895, 130.4046], [33.5884, 130.4030], [33.5898, 130.4018], [33.5925, 130.4038], [33.5955, 130.4062]] },
  { id: "fukuoka-fine", name: "Fukuoka: Fine, Honestly", color: "#9c36b5",
    blurb: "Nice people, great yatai, not a lot of microcosms. Rent a car and let Itoshima and Beppu do the heavy lifting.",
    // Hakata stn ↔ Tenjin ↔ Ohori, the walkable core
    points: [[33.6000, 130.3900], [33.5990, 130.4130], [33.5920, 130.4250], [33.5850, 130.4230], [33.5820, 130.4020], [33.5830, 130.3860], [33.5910, 130.3830]] },
  { id: "itoshima-boonies", name: "Itoshima Boonies Loop", color: "#2f9e44", fill: "dots",
    blurb: "Golden rice fields, one train track, no infrastructure. Get a car, pack hand sanitizer.",
    // the peninsula: Keya cape → Futamigaura → Maebaru → the Sefuri foothills
    points: [[33.6300, 130.1050], [33.6250, 130.1750], [33.6100, 130.2200], [33.5750, 130.2450], [33.5300, 130.2250], [33.4850, 130.1750], [33.5100, 130.1150], [33.5700, 130.0900]] },
  { id: "shimanami-route", name: "Shimanami Kaido Run", color: "#f08c00", fill: "hatch",
    blurb: "70km, 7 islands, zero excuses. Onomichi ramen at the start, Imabari towels at the end, a night somewhere in the middle.",
    // a ~7km-wide corridor around the route centerline: Onomichi → Mukaishima →
    // Innoshima → Ikuchijima (Setoda) → Omishima → Hakatajima → Oshima → Imabari.
    // Down the SE side, back up the NW side; both ends run a little past the terminals.
    points: [[34.398, 133.233], [34.386, 133.226], [34.365, 133.232], [34.334, 133.211], [34.302, 133.202], [34.284, 133.166], [34.272, 133.120], [34.243, 133.063], [34.227, 133.039], [34.197, 133.041], [34.182, 133.043], [34.159, 133.023], [34.127, 133.012], [34.091, 133.007], [34.050, 133.028], [34.038, 133.021], [34.074, 132.961], [34.086, 132.968], [34.127, 132.947], [34.163, 132.952], [34.195, 132.963], [34.218, 132.983], [34.233, 132.981], [34.263, 132.979], [34.279, 133.003], [34.308, 133.060], [34.320, 133.106], [34.338, 133.142], [34.370, 133.151], [34.401, 133.172], [34.422, 133.166], [34.434, 133.173]] },
  { id: "cat-street", name: "Cat Street Strut", color: "#1098ad",
    blurb: "The actually-good Harajuku: lowkey boutiques and thrift, strung between the two chaos poles.",
    points: [[35.6708, 139.7073], [35.6694, 139.7076], [35.6675, 139.7075], [35.6662, 139.7064], [35.6648, 139.7056], [35.6636, 139.7050], [35.6629, 139.7046], [35.6633, 139.7038], [35.6640, 139.7042], [35.6652, 139.7048], [35.6666, 139.7056], [35.6677, 139.7067], [35.6693, 139.7068], [35.6707, 139.7065]] },
];

// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const distKm = (a, b) => {
  const R = 6371, dLat = ((b[0] - a[0]) * Math.PI) / 180, dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// max drift (km) from the hand pin before a geocode hit is called a mismatch —
// tight for point-POIs, loose only where the pin itself is fuzzy
const GATE_KM = {
  food: 2, cafe: 2, night: 3, shop: 3, view: 3, museum: 3,
  temple: 5, park: 5, hood: 5, fun: 5, onsen: 10, trip: 50,
};
// a hit whose bounding box spans more than this is a district/park/mountain —
// its centroid is nowhere useful, the hand pin knows better
const MAX_BBOX_KM = 0.7;

async function geocodeAll() {
  const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, "utf8")) : {};
  for (const p of PLACES) {
    if (!p.q || p.pin || p.gmaps || cache[p.id]) continue; // pinned/linked places don't need Nominatim
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(p.q)}&format=json&limit=1&countrycodes=jp`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "nippon-top-geocoder/1.0 (lbkchen@gmail.com)" } });
      const hits = await res.json();
      if (hits.length) {
        const coords = [parseFloat(hits[0].lat), parseFloat(hits[0].lon)];
        const d = distKm(coords, p.fallback);
        const bb = (hits[0].boundingbox || []).map(Number); // [south, north, west, east]
        const bboxKm = bb.length === 4 ? distKm([bb[0], bb[2]], [bb[1], bb[3]]) : 0;
        const gate = GATE_KM[p.cat] || 5;
        if (bboxKm > MAX_BBOX_KM) {
          cache[p.id] = { bigArea: hits[0].display_name, bbox_km: Math.round(bboxKm * 10) / 10 };
          console.log(`✗ ${p.id}: matched a ${bboxKm.toFixed(1)}km-wide area — keeping the hand pin`);
        } else if (d < gate) {
          cache[p.id] = { coords, matched: hits[0].display_name, km_from_fallback: Math.round(d * 10) / 10 };
          console.log(`✓ ${p.id} (${d.toFixed(1)}km from fallback)`);
        } else {
          cache[p.id] = { rejected: hits[0].display_name, km_from_fallback: Math.round(d * 10) / 10 };
          console.log(`✗ ${p.id} rejected: ${d.toFixed(1)}km away (gate ${gate}km) — ${hits[0].display_name}`);
        }
      } else {
        cache[p.id] = { miss: true };
        console.log(`- ${p.id}: no result`);
      }
    } catch (e) {
      console.log(`! ${p.id}: ${e.message}`);
    }
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
    await sleep(1100);
  }
  return cache;
}

// ---- google share links: the ground-truth coordinate source ----
// A maps.app.goo.gl shortlink is a plain redirect; the resolved URL carries the
// exact marker as !3d<lat>!4d<lng> (the @lat,lng is just the viewport). No API.
const GMAPS_CACHE_PATH = join(__dirname, "gmaps-cache.json");

function parseGmapsCoords(url) {
  let u = url;
  try { u = decodeURIComponent(url); } catch { /* keep raw */ }
  const pin = [...u.matchAll(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/g)].pop();
  const at = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  const m = pin || at;
  if (!m) return null;
  const coords = [parseFloat(m[1]), parseFloat(m[2])];
  // garbage guard: must be in Japan
  return coords[0] > 24 && coords[0] < 46 && coords[1] > 122 && coords[1] < 154 ? coords : null;
}

async function resolveGmapsLinks() {
  const cache = existsSync(GMAPS_CACHE_PATH) ? JSON.parse(readFileSync(GMAPS_CACHE_PATH, "utf8")) : {};
  for (const p of PLACES) {
    if (!p.gmaps || cache[p.gmaps]) continue;
    try {
      const res = await fetch(p.gmaps, { headers: { "User-Agent": "Mozilla/5.0 (nippon-top build)" } });
      const coords = parseGmapsCoords(res.url);
      cache[p.gmaps] = coords ? { coords } : { noCoords: true };
      if (coords) {
        const d = distKm(coords, p.fallback);
        console.log(`✓ gmaps ${p.id} → [${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}]${d > 5 ? ` — heads up: ${d.toFixed(0)}km from the hand pin, double-check the link` : ""}`);
      } else {
        console.log(`- gmaps ${p.id}: link resolved but no coords in it (kgs/search links don't carry any)`);
      }
    } catch (e) {
      console.log(`! gmaps ${p.id}: ${e.message} — will retry next build`);
    }
    writeFileSync(GMAPS_CACHE_PATH, JSON.stringify(cache, null, 2));
  }
  return cache;
}

// Anything added through the app and exported (custom places, custom zones,
// doodles) lives only in data.js — carry it over so a rebuild never clobbers
// in-app work. (Friend maps live in friends/*.enc packs, untouched by rebuilds.)
function readExisting() {
  if (!existsSync(OUT_PATH)) return { places: [], zones: [], doodles: [] };
  try {
    const w = {};
    new Function("window", readFileSync(OUT_PATH, "utf8"))(w);
    return { places: [], zones: [], doodles: [], ...w.NIPPON };
  } catch (e) {
    console.error(`! could not parse existing data.js (${e.message}) — refusing to overwrite it`);
    process.exit(1);
  }
}

async function main() {
  const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, "utf8")) : {};
  if (process.argv.includes("--geocode")) await geocodeAll();
  const finalCache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, "utf8")) : cache;
  const gmapsCache = await resolveGmapsLinks();
  const existing = readExisting();
  // photos + gmaps pin-fixes made in-app live only in data.js after an export —
  // carry them over unless the master list says otherwise
  const existingPhotos = new Map(existing.places.filter((p) => p.photo).map((p) => [p.id, p.photo]));
  const existingById = new Map(existing.places.map((p) => [p.id, p]));

  const stats = { link: 0, pin: 0, geo: 0, fb: 0 };
  const places = PLACES.map((p) => {
    const prev = existingById.get(p.id);
    const gmaps = p.gmaps || prev?.gmaps || null;
    const link = gmaps && gmapsCache[gmaps];
    const hit = finalCache[p.id];
    let coords, approx = false;
    if (link?.coords) { coords = link.coords; stats.link++; }               // share link = ground truth
    else if (gmaps && prev?.gmaps === gmaps && prev.lat != null) { coords = [prev.lat, prev.lng]; stats.link++; } // resolved in-app, baked by export
    else if (p.pin) { coords = p.fallback; stats.pin++; }                   // hand pin beats a polygon centroid
    else if (hit?.coords) { coords = hit.coords; stats.geo++; }
    else { coords = p.fallback; approx = !!p.approx; stats.fb++; }
    return {
      id: p.id, name: p.name, star: p.star, region: p.region, group: p.group,
      cat: p.cat, emoji: p.emoji || null,
      lat: coords[0],
      lng: coords[1],
      approx,
      notes: p.notes,
      photo: p.photo || existingPhotos.get(p.id) || null, // filename in img/
      gmaps, // share link — exact pin + where "open in google maps" goes
    };
  });
  // in-app additions survive rebuilds
  places.push(...existing.places.filter((p) => String(p.id).startsWith("custom-")));
  const masterZoneIds = new Set(ZONES.map((z) => z.id));
  const zones = [...ZONES, ...existing.zones.filter((z) => !masterZoneIds.has(z.id))];

  const data = {
    places,
    chains: CHAINS,
    zones,
    doodles: existing.doodles,
  };
  const out = `// Generated by tools/build-data.mjs — edit that file (or use the in-app editor + export), don't edit this one.
window.NIPPON = ${JSON.stringify(data, null, 2)};
`;
  writeFileSync(OUT_PATH, out);
  console.log(`\nWrote ${OUT_PATH}: ${places.length} places, ${CHAINS.length} chains, ${zones.length} zones, ${existing.doodles.length} doodles`);
  console.log(`Coords: ${stats.link} from gmaps links, ${stats.pin} hand-pinned, ${stats.geo} geocoded, ${stats.fb} on fallbacks (${places.filter((p) => p.approx).length} ~ish — paste a gmaps link in-app or add gmaps: here to fix)`);
}

main();
