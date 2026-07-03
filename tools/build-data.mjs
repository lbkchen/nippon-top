#!/usr/bin/env node
// Builds ../data.js from the master list below.
//   node tools/build-data.mjs            -> writes data.js using cached/fallback coords
//   node tools/build-data.mjs --geocode  -> refreshes coords via Nominatim (1 req/sec, cached)
//
// Every place has a `fallback` [lat, lng] (hand-placed, at least neighborhood-accurate).
// Geocoded hits are only accepted when within 50km of the fallback, so a bad match
// can never yeet a ramen shop into the ocean.

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
    q: "Inokashira Park, Musashino, Japan", fallback: [35.7003, 139.5731],
    notes: "Big park next to Kichijoji and Ghibli museum, really nice to walk around and likely much less crowded/touristy, one of the nicest parks near tokyo IMO" },
  { id: "higashi-koganei", name: "Higashi Koganei", star: false, region: "West Tokyo", group: "tokyo", cat: "hood",
    q: "Higashi-Koganei Station, Koganei, Japan", fallback: [35.7014, 139.5261],
    notes: "Nothing crazy but it's a nice residential neighborhood if you want to experience some of that suburb life. Go to Kujira Shokudo for an amazing tsukemen - it's shoyu instead of fish based. Then explore the back alleys near the station for more food, izakaya (torikizoku), karaoke, etc." },
  { id: "ghibli-museum", name: "Ghibli Museum", star: true, region: "West Tokyo", group: "tokyo", cat: "museum", emoji: "🐉",
    q: "Ghibli Museum, Mitaka, Japan", fallback: [35.6962, 139.5704],
    notes: "Famous museum showcasing the Ghibli filmmaking process, amazing experience but hard to get tickets." },
  { id: "ramenya-shima", name: "Ramenya Shima", star: false, region: "West Tokyo", group: "tokyo", cat: "food",
    q: "らぁめん小池 嶋", fallback: [35.7038, 139.5993], approx: true,
    notes: "Best shoyu ramen I've had. Super annoying to get in tho - 60 bowls a day, you must sign up at 8-9am at the door, then return at the predetermined time slot - see Goog reviews lol. Only for the real fans." },
  { id: "tonkatsu-narikura", name: "Tonkatsu Narikura", star: false, region: "West Tokyo", group: "tokyo", cat: "food",
    q: "とんかつ成蔵 杉並区", fallback: [35.6998, 139.6357], approx: true,
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
  { id: "roastery-nozy", name: "The Roastery by Nozy Coffee", star: false, region: "Shinjuku/Shibuya Area", group: "tokyo", cat: "cafe", emoji: "☕",
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

  // ---------------- EAST TOKYO ----------------
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
    q: "焼鳥おみ乃 押上", fallback: [35.7080, 139.8100], approx: true,
    notes: "Delicious yakitori (chicken skewer) omakase place near Skytree. They serve you until you say stop so come v hungry and experience the great joy of binchotan charcoal grilled chicken parts. The catch is you gotta book like 2+ months in advance on Omakase (as of Mar '24)" },
  { id: "takesue", name: "Takesue Tokyo Premium (ramen)", star: false, region: "East Tokyo", group: "tokyo", cat: "food",
    q: "竹末東京Premium 押上", fallback: [35.7133, 139.8172], approx: true,
    notes: "Awesome local shop, highly recommend the chicken scallop base, and it has the most delicious toppings." },
  { id: "tomita", name: "Chuka soba Tomita (ramen)", star: true, region: "East Tokyo (far-ish)", group: "tokyo", cat: "food", emoji: "🐐",
    q: "中華蕎麦とみ田 松戸", fallback: [35.7847, 139.9006], approx: true,
    notes: "GOAT ramen rated #1 in japan for several years. I booked relatively easily online thru Omakase. Was a wild experience you can feel the attention to every small detail. And you will also leave stuffed." },

  // ---------------- CENTRAL / NORTH / SOUTH TOKYO ----------------
  { id: "rokurinsha", name: "Rokurinsha", star: false, region: "Central Tokyo?", group: "tokyo", cat: "food",
    q: "六厘舎 東京駅", fallback: [35.6797, 139.7688], approx: true,
    notes: "Famous ramen restaurant right in Tokyo station, known for seafood-forward tsukemen with thicc noods." },
  { id: "kagari", name: "Kagari (ramen)", star: false, region: "Central Tokyo?", group: "tokyo", cat: "food",
    q: "銀座 篝 本店", fallback: [35.6707, 139.7635], approx: true,
    notes: "Main branch is in Ginza I think -- exists elsewhere. Otemachi has a larger one with 4 people seating, rest are mostly counter seats. BEST tori paitan I've ever had, strongly recommend." },
  { id: "uniqlo-ginza", name: "Uniqlo Ginza", star: false, region: "Central Tokyo?", group: "tokyo", cat: "shop",
    q: "Uniqlo Ginza, Tokyo, Japan", fallback: [35.6717, 139.7639],
    notes: "There are 2 giant Uniqlo's in Ginza and both are pretty interesting - one is the 12 floor HQ which is the one everyone goes to but the other one is also huge and has 3-4 very wide stories of a ton of goods which made it a much more enjoyable shopping experience." },
  { id: "tokyo-tower", name: "Tokyo Tower", star: false, region: "Central Tokyo?", group: "tokyo", cat: "view",
    q: "Tokyo Tower, Minato, Japan", fallback: [35.6586, 139.7454],
    notes: "Overrated - would not recommend this or Skytree. I think you can go to some tall buildings in Roppongi for a similar experience with the Tokyo tower in your view..." },
  { id: "garden-lounge", name: "Garden Lounge", star: false, region: "Central Tokyo?", group: "tokyo", cat: "cafe", emoji: "🍰",
    q: "Garden Lounge, Hotel New Otani, Tokyo", fallback: [35.6801, 139.7340], approx: true,
    notes: "AYCE dessert place with a sick view of the garden (Shinjuku Gyoen?). Have not been, it looks amazing." },
  { id: "akihabara", name: "Akihabara", star: false, region: "Central Tokyo?", group: "tokyo", cat: "fun", emoji: "🕹️",
    q: "Akihabara Station, Tokyo, Japan", fallback: [35.6984, 139.7731],
    notes: "Anime district, prepare to be overwhelmed. Themed/maid/cat/crazy cafes, electronics stores, collectible stores, this place has it all." },
  { id: "nakiryu", name: "Nakiryu (ramen)", star: false, region: "North Tokyo", group: "tokyo", cat: "food",
    q: "鳴龍 大塚", fallback: [35.7269, 139.7286], approx: true,
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
    q: "Fushimi Inari Taisha, Kyoto, Japan", fallback: [34.9671, 135.7727],
    notes: "The classic thousand-rows of orange torii gates -- extremely touristy and probably the most crowded shrine during peak travel season but a must see at least once, go early in the morning for the best experience and make sure to hike to the top." },
  { id: "arashiyama", name: "Arashiyama", star: true, region: "Kyoto", group: "kyoto", cat: "park", emoji: "🎋",
    q: "Arashiyama Bamboo Grove, Kyoto, Japan", fallback: [35.0170, 135.6710],
    notes: "Famous for the bamboo forest but boy is it crowded there. I would go very early like 6am if you care about avoiding crowds, but in general the surrounding area is super worth walking or biking around too. There are beautiful mountain landscapes and traditional looking streets here, and plenty of temples and shrines. If you only care about the bamboo forest there is an equally good, lesser known one at Adashino Nenbutsuji (15 min away by rental bike)" },
  { id: "monkey-park", name: "Arashiyama Monkey Park", star: true, region: "Kyoto", group: "kyoto", cat: "fun", emoji: "🐒",
    q: "Iwatayama Monkey Park, Kyoto, Japan", fallback: [35.0128, 135.6778],
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
    q: "雷 うどん 京都 銀閣寺", fallback: [35.0244, 135.7938], approx: true,
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
    q: "Gion, Kyoto, Japan", fallback: [35.0037, 135.7752],
    notes: "Famous shopping arcade popular with tourists. Near the center of it in the north-south canals is Pontocho which is known as the red light district in Kyoto, where you can find izakaya and night life. Unclear if we faced subtle racism here 🙃" },
  { id: "nara", name: "Nara", star: true, region: "Near Kyoto", group: "kyoto", cat: "trip", emoji: "🦌",
    q: "Nara Park, Nara, Japan", fallback: [34.6851, 135.8430],
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
    q: "お好み焼 千とせ 大阪", fallback: [34.6503, 135.5064], approx: true,
    notes: "Really great okonomiyaki, osaka style. There are tons of other places too just make sure to try it once in Osaka and Hiroshima if you go there too the styles are different." },
  { id: "osaka-castle", name: "Osaka Castle", star: false, region: "Osaka", group: "osaka", cat: "view", emoji: "🏯",
    q: "Osaka Castle, Osaka, Japan", fallback: [34.6873, 135.5262],
    notes: "Impressive castle worth checking out, idr much else lol." },
  { id: "onigiri-gorichan", name: "Onigiri Gorichan", star: false, region: "Osaka", group: "osaka", cat: "food", emoji: "🍙",
    q: "おにぎり ゴリちゃん 大阪", fallback: [34.6960, 135.4740], approx: true,
    notes: "We waited 30m for this but was worth it - massive onigiri with whatever toppings you want. The unagi egg yolk one was so bomb. Staff were over the top friendly. https://maps.app.goo.gl/5Dns7DF72VFs3bBh7" },
  { id: "kadoya-shokudo", name: "Kadoya Shokudo (ramen)", star: false, region: "Osaka", group: "osaka", cat: "food",
    q: "カドヤ食堂 総本店 大阪", fallback: [34.6746, 135.4900], approx: true,
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

  // ---------------- HOKKAIDO ----------------
  { id: "lake-toya", name: "Lake Toya", star: false, region: "Hokkaido (West)", group: "hokkaido", cat: "onsen", emoji: "🏞️",
    q: "Toyako Onsen, Japan", fallback: [42.5657, 140.8195],
    notes: "Beautiful lake and a very popular stop on the way from Sapporo. Great place to stay in a ryokan - would recommend the Lake Suite Ko No Sumika." },
  { id: "soup-curry-mogmog", name: "Soup Curry MogMog", star: false, region: "Hokkaido (West)", group: "hokkaido", cat: "food", emoji: "🍛",
    q: "スープカレー もぐもぐ 洞爺湖", fallback: [42.5510, 140.7570], approx: true,
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
];

// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const distKm = (a, b) => {
  const R = 6371, dLat = ((b[0] - a[0]) * Math.PI) / 180, dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

async function geocodeAll() {
  const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, "utf8")) : {};
  for (const p of PLACES) {
    if (!p.q || cache[p.id]) continue;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(p.q)}&format=json&limit=1&countrycodes=jp`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "nippon-top-geocoder/1.0 (lbkchen@gmail.com)" } });
      const hits = await res.json();
      if (hits.length) {
        const coords = [parseFloat(hits[0].lat), parseFloat(hits[0].lon)];
        const d = distKm(coords, p.fallback);
        if (d < 50) {
          cache[p.id] = { coords, matched: hits[0].display_name, km_from_fallback: Math.round(d * 10) / 10 };
          console.log(`✓ ${p.id} (${d.toFixed(1)}km from fallback)`);
        } else {
          cache[p.id] = { rejected: hits[0].display_name, km_from_fallback: Math.round(d) };
          console.log(`✗ ${p.id} rejected: ${d.toFixed(0)}km away — ${hits[0].display_name}`);
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
  const existing = readExisting();
  // photos attached in-app (dev drag-and-drop) live only in data.js after an
  // export — carry them over unless the master list names one explicitly
  const existingPhotos = new Map(existing.places.filter((p) => p.photo).map((p) => [p.id, p.photo]));

  const places = PLACES.map((p) => {
    const hit = finalCache[p.id];
    const geocoded = hit && hit.coords;
    return {
      id: p.id, name: p.name, star: p.star, region: p.region, group: p.group,
      cat: p.cat, emoji: p.emoji || null,
      lat: geocoded ? hit.coords[0] : p.fallback[0],
      lng: geocoded ? hit.coords[1] : p.fallback[1],
      approx: p.approx && !geocoded ? true : false,
      notes: p.notes,
      photo: p.photo || existingPhotos.get(p.id) || null, // filename in img/
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
  console.log(`Geocoded: ${PLACES.filter((p) => finalCache[p.id]?.coords).length}, fallback: ${PLACES.filter((p) => !finalCache[p.id]?.coords).length}, approx-flagged: ${places.filter((p) => p.approx).length}`);
}

main();
