// Small verified fallback set so the card remains useful when a publisher blocks
// automated requests. Live source pages are still requested and take priority.
export const RANKING_FALLBACKS = {
  nhl: {
    "connor mcdavid": 1,
    "nathan mackinnon": 2,
    "nikita kucherov": 3,
    "macklin celebrini": 4,
    "cale makar": 8,
    "zach werenski": 11,
    "quinn hughes": 12,
    "cole caufield": 19,
    "evan bouchard": 21,
    "matthew schaefer": 40,
    "jake oettinger": 41,
    "kirill marchenko": 52,
    "jesper wallstedt": 55,
    "will smith": 60,
    "beckett sennecke": 75,
    "gavin mckenna": 81,
    "anton frondell": 110,
    "cole hutson": 114,
    "ivar stenberg": 141,
    "matvei michkov": 198
  },
  espn: {
    "nathan mackinnon": 1,
    "connor mcdavid": 2,
    "nikita kucherov": 3,
    "macklin celebrini": 4,
    "cale makar": 16,
    "evan bouchard": 17,
    "matthew schaefer": 40
  },
  yahoo: {
    "nathan mackinnon": 1,
    "connor mcdavid": 2,
    "cale makar": 4,
    "nikita kucherov": 5,
    "macklin celebrini": 6
  },
  cbs: {
    "nikita kucherov": 1,
    "nathan mackinnon": 4,
    "jake oettinger": 6,
    "connor mcdavid": 10,
    "cale makar": 48,
    "zach werenski": 57,
    "macklin celebrini": 70,
    "quinn hughes": 72,
    "cole caufield": 80
  }
};
