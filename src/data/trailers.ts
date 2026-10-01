import { entryKey, type TimelineEntry } from './timeline';

/**
 * Official trailer for each title on the timeline, as a YouTube video id,
 * keyed by `entryKey` (src/data/timeline.ts).
 *
 * Each id was checked against YouTube's oEmbed endpoint, which only answers
 * for videos that exist and allow embedding, so all of them play in the
 * on-site player. The comment after each is the channel and video title at
 * the time. Older films predate the studios' YouTube channels, so a few use
 * archive channels such as Rotten Tomatoes Classic Trailers.
 *
 * A title missing here (say, one added later) falls back to a YouTube search
 * link instead of the player.
 */
export const TRAILERS: Readonly<Record<string, string>> = {
  'x-men-the-animated-series-1992': 'gh0KJImjkqc', // Disney Plus: X-Men: The Animated Series | Unofficial Official Trailer | Disney+
  'x-men-2000': 'VNxwlx6etXI', // Rotten Tomatoes Classic Trailers: X-Men (2000) Trailer #1 | Movieclips Classic Trailers
  'x2-x-men-united-2003': 'KNIdceH7XOw', // 20th Century Studios: X2 | #TBT Trailer | 20th Century FOX
  'fantastic-four-2005': 'YP-UetX2qX0', // Rotten Tomatoes Classic Trailers: Fantastic Four (2005) Trailer #1 | Movieclips Classic Trailers
  'x-men-the-last-stand-2006': 'ZQ0v5dXbw7M', // Rotten Tomatoes Classic Trailers: X-Men: The Last Stand (2006) Trailer #1 | Movieclips Classic Trailers
  'fantastic-four-rise-of-the-silver-surfer-2007': 'Wiu5eZ_7vSY', // Rotten Tomatoes Classic Trailers: Fantastic Four: Rise of the Silver Surfer (2007) Trailer #1 | Movieclips Classic Trailers
  'x-men-origins-wolverine-2009': '8TQ-gD4UCmI', // 20th Century Studios: X-Men Origins: Wolverine Trailer "Ooh! Shiny." | Trailer | 20th Century FOX
  'x-men-first-class-2011': 'XKF6J6kgs0s', // 20th Century Studios UK: X-Men: First Class | International Trailer | 2011
  'the-wolverine-2013': 'toLpchTUYk8', // Rotten Tomatoes Trailers: The Wolverine Official Trailer #1 (2013) - Hugh Jackman Movie HD
  'x-men-days-of-future-past-2014': 'hMeKYG5y8wc', // Rotten Tomatoes Trailers: X-Men: Days of Future Past Official Trailer #1 (2014) - Hugh Jackman Movie HD
  'fantastic-four-2015': '_rRoD28-WgU', // 20th Century Studios: Fantastic Four | Official Trailer [HD] | 20th Century FOX
  'deadpool-2016': 'Xithigfg7dA', // 20th Century Studios UK: Deadpool | Official HD Trailer #1 | 2016
  'x-men-apocalypse-2016': 'PfBVIHgQbYk', // 20th Century Studios: X-Men: Apocalypse | Official Trailer [HD] | 20th Century FOX
  'legion-2017': '31I8Y_ET9xI', // FX Networks: Legion | Season 1: Trailer #2 | FX
  'logan-2017': 'Div0iP65aZo', // 20th Century Studios: Logan | Official Trailer [HD] | 20th Century FOX
  'the-gifted-2017': '3pDdXYf3nfc', // Marvel Entertainment: The Gifted (FOX) - Official SDCC 2017 Trailer
  'deadpool-2-2018': 'D86RtevtfrA', // 20th Century Studios: Deadpool 2 | The Trailer
  'dark-phoenix-2019': 'azvR__GRQic', // 20th Century Studios: Dark Phoenix | Final Trailer [HD] | 20th Century FOX
  'the-new-mutants-2020': 'W_vJhUAOFpI', // 20th Century Studios: The New Mutants | Official Trailer | 20th Century FOX
  'x-men-97-2024': 'pv3Ss8o9gGQ', // Marvel Entertainment: Marvel Animation's X-Men '97 | Official Trailer | Disney+
  'spider-man-2002': 't06RUxPbp_c', // Sony Pictures Entertainment: SPIDER-MAN [2002] – Official Trailer (HD)
  'spider-man-2-2004': '1s9Yln0YwCw', // KinoCheck.com: SPIDER-MAN 2 Trailer (2004)
  'spider-man-3-2007': 'e5wUilOeOmg', // Sony Pictures Entertainment: SPIDER-MAN 3 [2007] - Official Trailer (HD)
  'the-amazing-spider-man-2012': '-tnxzJ0SSOw', // Sony Pictures Entertainment: THE AMAZING SPIDER-MAN 3D - Official Trailer
  'the-amazing-spider-man-2-2014': 'DlM2CWNTQ84', // Sony Pictures Entertainment: The AMAZING SPIDER-MAN 2 - Official Trailer #2 (HD)
  'venom-2018': 'u9Mv98Gr5pY', // Sony Pictures Entertainment: VENOM - Official Trailer (HD)
  'spider-man-into-the-spider-verse-2018': 'g4Hbz2jLxvQ', // Sony Pictures Entertainment: SPIDER-MAN: INTO THE SPIDER-VERSE - Official Trailer (HD)
  'venom-let-there-be-carnage-2021': '-FmWuCgJmxo', // Sony Pictures Entertainment: VENOM: LET THERE BE CARNAGE - Official Trailer 2 (HD)
  'morbius-2022': 'oZ6iiRrz1SY', // Sony Pictures Entertainment: MORBIUS - Official Trailer (HD)
  'spider-man-across-the-spider-verse-2023': 'cqGjhVJWtEg', // Sony Pictures Entertainment: SPIDER-MAN: ACROSS THE SPIDER-VERSE - Official Trailer (HD)
  'madame-web-2024': 's_76M4c4LTo', // Sony Pictures Entertainment: MADAME WEB – Official Trailer (HD)
  'venom-the-last-dance-2024': 'HyIyd9joTTc', // Sony Pictures Entertainment: VENOM: THE LAST DANCE – Final Trailer (HD)
  'kraven-the-hunter-2024': 'I8gFw4-2RBM', // Marvel Entertainment: Kraven the Hunter | Official Trailer
  'blade-1998': 'O2Y3FFFIvRI', // Warner Bros. Entertainment: Blade | 4K Trailer | Warner Bros. Entertainment
  'blade-ii-2002': 'vAUB7dcUn8o', // Movieclips: Blade 2 Official Trailer #1 - (2002) HD
  'daredevil-2003': 'muPX9Oi7-EE', // Rotten Tomatoes Classic Trailers: Daredevil (2003) Trailer #1 | Movieclips Classic Trailers
  'hulk-2003': '2ErnLuJKQA4', // Rotten Tomatoes Classic Trailers: Hulk (2003) Official Trailer #1 - Erica Bana Movie HD
  'the-punisher-2004': '8e0VvW9-M1Q', // Rotten Tomatoes Classic Trailers: The Punisher (2004) Trailer #1 | John Travolta, Thomas Jane, Will Patton
  'blade-trinity-2004': 'fPcNbsW69Eg', // Rotten Tomatoes Classic Trailers: Blade: Trinity (2004) Official Trailer - Wesley Snipes, Ryan Reynolds Movie HD
  'elektra-2005': '3ZWcZrwvoT8', // Rotten Tomatoes Classic Trailers: Elektra (2005) Trailer #1 | Jennifer Garner, Kirsten Zien, Terence Stamp
  'ghost-rider-2007': 'nu6R7ypaz5g', // Sony Pictures Entertainment: GHOST RIDER [2007] – Official Trailer (HD)
  'punisher-war-zone-2008': 'liABMxEvPAc', // Lionsgate Movies: Punisher: War Zone (2008) - Official Trailer #1
  'ghost-rider-spirit-of-vengeance-2012': 'UUObgxCoUgA', // Sony Pictures Entertainment: GHOST RIDER: SPIRIT OF VENGEANCE 3D - Official Trailer - In Theaters 2/17/12
  'iron-man-2008': '8ugaeA-nMTc', // Rotten Tomatoes Classic Trailers: Iron Man (2008) Trailer #1 | Movieclips Classic Trailers
  'the-incredible-hulk-2008': 'dz6eBeW19Lg', // Universal Pictures At Home: The Incredible Hulk - Trailer
  'iron-man-2-2010': 'BoohRoVA9WQ', // Movieclips: Iron Man 2 Official Trailer #1 (2010) - Marvel Movie HD
  'thor-2011': 'JOddp-nlNvQ', // Marvel Entertainment: Thor - Trailer (OFFICIAL)
  'captain-america-the-first-avenger-2011': 'JerVrbLldXw', // Marvel Entertainment: Captain America: The First Avenger - Trailer
  'the-avengers-2012': 'eOrNdBpGMv8', // Marvel Entertainment: Marvel's The Avengers- Trailer (OFFICIAL)
  'iron-man-3-2013': 'Ke1Y3P9D0Bc', // Marvel UK: Iron Man 3 -- Official Trailer UK Marvel | HD
  'agents-of-s-h-i-e-l-d-2013': 'T3T-evQZiQo', // Marvel Entertainment: Marvel's Agents of S.H.I.E.L.D. - Trailer 1 (Official)
  'thor-the-dark-world-2013': 'npvJ9FTgZbM', // Marvel Entertainment: Thor: The Dark World Official Trailer HD
  'captain-america-the-winter-soldier-2014': '7SlILk2WMTI', // Marvel Entertainment: Marvel's Captain America: The Winter Soldier - Trailer 2 (OFFICIAL)
  'guardians-of-the-galaxy-2014': 'd96cjJhvlMA', // Marvel Entertainment: Marvel's Guardians of the Galaxy - Trailer 1 (OFFICIAL)
  'agent-carter-2015': 'V13W9gQ_1GA', // Marvel Entertainment: Marvel's Agent Carter Sneak Peek
  'daredevil-2015': 'jAy6NJ_D5vU', // Netflix: Marvel's Daredevil | Official Trailer [HD] | Netflix
  'avengers-age-of-ultron-2015': 'tmeOjFno6Do', // Marvel Entertainment: Marvel's "Avengers: Age of Ultron" - Teaser Trailer (OFFICIAL)
  'ant-man-2015': 'pWdKf3MneyI', // Marvel Entertainment: Marvel's Ant-Man - Trailer 1
  'jessica-jones-2015': 'nWHUjuJ8zxE', // Netflix: Marvel's Jessica Jones | Official Trailer [HD] | Netflix
  'captain-america-civil-war-2016': 'dKrVegVI0Us', // Marvel Entertainment: Marvel's Captain America: Civil War - Trailer 2
  'luke-cage-2016': 'ORa4hPhGrpo', // Marvel UK: Marvel's Luke Cage - Official trailer | HD
  'doctor-strange-2016': 'HSzx-zryEgM', // Marvel Entertainment: Doctor Strange Official Trailer 2
  'iron-fist-2017': 'f9OKL5no-S0', // Netflix: Marvel's Iron Fist | Official Trailer [HD] | Netflix
  'guardians-of-the-galaxy-vol-2-2017': 'dW1BIid8Osg', // Marvel Entertainment: Guardians of the Galaxy Vol. 2 Teaser Trailer
  'spider-man-homecoming-2017': 'rk-dF1lIbIg', // Sony Pictures Entertainment: SPIDER-MAN: HOMECOMING - Official Trailer (HD)
  'the-defenders-2017': 'jYvHxEEgrPA', // Netflix Malaysia: Marvel’s The Defenders | Official Trailer | Netflix [HD]
  'inhumans-2017': '1sYF1SXcWqQ', // Marvel Entertainment: Marvel's Inhumans - Official Trailer 1
  'thor-ragnarok-2017': 'ue80QwXMRHg', // Marvel Entertainment: "Thor: Ragnarok" Official Trailer
  'the-punisher-2017': 's4QV6OZdmWY', // Rotten Tomatoes Trailers: Marvel's The Punisher Season 1 Trailer #1 (2017) | TV Trailer | Movieclips Trailers
  'runaways-2017': 'ggMhg2dow0Q', // IMDb: Runaways (2017) | TRAILER
  'black-panther-2018': 'xjDjIWPwcPU', // Marvel Entertainment: Marvel Studios' Black Panther - Official Trailer
  'avengers-infinity-war-2018': '6ZfuNTqbHE8', // Marvel Entertainment: Marvel Studios' Avengers: Infinity War Official Trailer
  'cloak-dagger-2018': 'Bglj2PeVNTA', // Amazon Prime Video UK & IE: Marvel's Cloak & Dagger - Trailer | Prime Video
  'ant-man-and-the-wasp-2018': '8_rTIAOohas', // Marvel Entertainment: Marvel Studios' Ant-Man and the Wasp - Official Trailer #1
  'captain-marvel-2019': 'Z1BCujX3pw8', // Marvel Entertainment: Marvel Studios' Captain Marvel - Official Trailer
  'avengers-endgame-2019': 'TcMBFSGVi1c', // Marvel Entertainment: Marvel Studios' Avengers: Endgame - Official Trailer
  'spider-man-far-from-home-2019': 'Nt9L1jCKGnE', // Sony Pictures Entertainment: SPIDER-MAN: FAR FROM HOME - Official Trailer
  'helstrom-2020': 'XKeugS4qjag', // Hulu: Helstrom - Trailer (Official) | Hulu
  'wandavision-2021': 'sj9J2ecsSpo', // Marvel Entertainment: WandaVision | Official Trailer | Disney+
  'the-falcon-and-the-winter-soldier-2021': 'IWBsDaFWyTE', // Marvel Entertainment: Official Trailer | The Falcon and the Winter Soldier | Disney+
  'loki-2021': 'nW948Va-l10', // Marvel Entertainment: Marvel Studios' Loki | Official Trailer | Disney+
  'black-widow-2021': 'ybji16u608U', // Marvel Entertainment: Marvel Studios' Black Widow | Official Trailer
  'what-if-2021': 'x9D0uUKJ5KI', // Marvel Entertainment: Marvel Studios' What If...? | Official Trailer | Disney+
  'shang-chi-and-the-legend-of-the-ten-rings-2021': 'giWIr7U1deA', // Marvel Entertainment: Marvel Studios’ Shang-Chi and the Legend of the Ten Rings | Official Teaser
  'eternals-2021': 'x_me3xsvDgk', // Marvel Entertainment: Marvel Studios’ Eternals | Final Trailer
  'hawkeye-2021': '5VYb3B1ETlk', // Marvel Entertainment: Marvel Studios’ Hawkeye | Official Trailer | Disney+
  'spider-man-no-way-home-2021': 'JfVOs4VSpmA', // Sony Pictures Entertainment: SPIDER-MAN: NO WAY HOME - Official Trailer (HD)
  'moon-knight-2022': 'x7Krla_UxRg', // Marvel Entertainment: Marvel Studios’ Moon Knight | Official Trailer | Disney+
  'doctor-strange-in-the-multiverse-of-madness-2022': 'aWzlQ2N6qqg', // Marvel Entertainment: Marvel Studios' Doctor Strange in the Multiverse of Madness | Official Trailer
  'ms-marvel-2022': 'm9EX0f6V11Y', // Marvel Entertainment: Marvel Studios’ Ms. Marvel | Official Trailer | Disney+
  'thor-love-and-thunder-2022': 'Go8nTmfrQd8', // Marvel Entertainment: Marvel Studios' Thor: Love and Thunder | Official Trailer
  'i-am-groot-2022': 'D7eFpRf4tac', // Marvel Entertainment: I Am Groot | Official Trailer | Disney+
  'she-hulk-attorney-at-law-2022': 'u7JsKhI2An0', // Marvel Entertainment: Official Trailer | She-Hulk: Attorney at Law | Disney+
  'werewolf-by-night-2022': 'bLEFqhS5WmI', // Marvel Entertainment: Marvel Studios’ Special Presentation: Werewolf By Night | Official Trailer | Disney+
  'black-panther-wakanda-forever-2022': '_Z3QKkl1WyM', // Marvel Entertainment: Marvel Studios’ Black Panther: Wakanda Forever | Official Trailer
  'the-guardians-of-the-galaxy-holiday-special-2022': 'OYhFFQl4fLs', // Marvel Entertainment: Marvel Studios’ Special Presentation: The Guardians of the Galaxy Holiday Special | Official Trailer
  'ant-man-and-the-wasp-quantumania-2023': 'ZlNFpri-Y40', // Marvel Entertainment: Marvel Studios’ Ant-Man and The Wasp: Quantumania | Official Trailer
  'guardians-of-the-galaxy-vol-3-2023': 'u3V5KDHRQvk', // Marvel Entertainment: Marvel Studios’ Guardians of the Galaxy Vol. 3 | Official Trailer
  'secret-invasion-2023': 'qZVTkn2NjS0', // Marvel Entertainment: Marvel Studios’ Secret Invasion | Official Trailer | Disney+
  'loki-season-2-2023': 'dug56u8NN7g', // Marvel Entertainment: Marvel Studios’ Loki Season 2 | Official Trailer | Disney+
  'the-marvels-2023': 'wS_qbDztgVY', // Marvel Entertainment: Marvel Studios' The Marvels | Official Trailer
  'what-if-season-2-2023': 'TiEVqZ2Bc_c', // Marvel Entertainment: Marvel Studios’ What If…? Season 2 | Official Trailer | Disney+
  'echo-2024': 'AFUKnherhuw', // Marvel Entertainment: Marvel Studios' Echo | Official Trailer | Disney+ and Hulu
  'deadpool-wolverine-2024': '73_1biulkYk', // Marvel Entertainment: Deadpool & Wolverine | Official Trailer | In Theaters July 26
  'agatha-all-along-2024': 'R9pXbNz6Vbw', // Marvel Entertainment: Marvel Television’s Agatha All Along | Official Trailer | Disney+
  'what-if-season-3-2024': 'umiKiW4En9g', // Marvel Entertainment: Marvel Animation’s What If…? Season 3 | Official Trailer | Disney+
  'your-friendly-neighborhood-spider-man-2025': 'N3J2JRQg040', // Marvel Entertainment: Marvel Animation’s Your Friendly Neighborhood Spider-Man | Official Trailer | Disney+
  'captain-america-brave-new-world-2025': '1pHDWnXmK7Y', // Marvel Entertainment: Captain America: Brave New World | Official Trailer
  'daredevil-born-again-2025': '7xALolZzhSM', // Marvel Entertainment: Marvel Television's Daredevil: Born Again | Official Trailer | Disney+
  'thunderbolts-2025': 'hUUszE29jS0', // Marvel Entertainment: Marvel Studios’ Thunderbolts* | Big Game Trailer | In Theaters May 2
  'ironheart-2025': 'WpW36ldAqnM', // Marvel Entertainment: Marvel Television's Ironheart | Official Trailer | Disney+
  'the-fantastic-four-first-steps-2025': '18QQWa5MEcs', // Marvel Entertainment: The Fantastic Four: First Steps | Final Trailer | Only in Theaters July 25
  'eyes-of-wakanda-2025': 'ODHh6oe4MlE', // Marvel Entertainment: Eyes of Wakanda | Official Trailer
  'marvel-zombies-2025': 'twHYF506-9Y', // Marvel Entertainment: Marvel Animation’s Marvel Zombies | Official Trailer | Disney+
  'wonder-man-2026': 'wHuWmjXsReU', // Marvel Entertainment: Marvel Television’s Wonder Man | Official Trailer
  'daredevil-born-again-season-2-2026': 'U1MqJBVn8Rk', // Marvel Entertainment: Marvel Television’s Daredevil: Born Again Season 2 | Official Trailer
  'the-punisher-special-presentation-2026': 'oSeqs_xeqv4', // Marvel Entertainment: A Marvel Television Special Presentation: The Punisher: One Last Kill | Official Trailer
  'spider-man-brand-new-day-2026': '62bIsvRcPv0', // Sony Pictures Entertainment: SPIDER-MAN: BRAND NEW DAY – New Trailer (4K)
  'visionquest-2026': 'oSVTAUKyrL8', // Marvel Entertainment: Marvel Television’s VisionQuest | Official Trailer
  'avengers-doomsday-2026': 'irVNGjRFZGk', // Marvel Entertainment: Avengers: Doomsday | Official Trailer | In Theaters December 18
};

type Titled = Pick<TimelineEntry, 'title' | 'year'>;

/** The title's trailer video id, or `null` when none is on file. */
export function trailerIdFor(entry: Titled): string | null {
  return TRAILERS[entryKey(entry)] ?? null;
}

/** Fallback for a title with no id: YouTube's results for its official trailer. */
export function trailerSearchUrl(entry: Titled): string {
  const query = `${entry.title} ${entry.year} official trailer`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
