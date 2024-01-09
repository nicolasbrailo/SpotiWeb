const CAT_MISSING_GROUP_NAME = "category missing";
const CAT_MISC_GROUP_NAME = "misc";
const GROUP_SIMILARITY_THRESHOLD = .9;
const GROUP_IS_SMALL_THRESHOLD = 4;
const GROUP_IS_SMALL_SECOND_STEP_THRESHOLD = 8;

function indexArts(raw_arts) {
  const arts_idx = new Map();
  for (const art of raw_arts) {
    arts_idx.set(art.name, art);
  }
  return arts_idx;
}

function indexGenToArt(raw_arts) {
  const genIdx = new Map();
  genIdx.set(CAT_MISSING_GROUP_NAME, []);
  for (const art of raw_arts) {
    if (art.genres.length == 0) {
      genIdx.get(CAT_MISSING_GROUP_NAME).push(art.name);
    } else {
      for (const gen of art.genres) {
        if (genIdx.has(gen)) {
          genIdx.get(gen).push(art.name);
        } else {
          genIdx.set(gen, [art.name]);
        }
      }
    }
  }
  return genIdx;
}

// Remove keys pointing to null from a dictionary
function filterNulls(m) {
  for (const k of m.keys()) {
    if (m.get(k) == null) {
      //console.log("Remove genre", k, m.get(k));
      m.delete(k);
    }
  }
}

// Merge "similar" groups, where similarity is defined by overlapScore
//
// gen_to_art is a map like
//  {
//    Group1: [Element1a, Element1b... Element1n],
//    Group2: [Element2a, Element2b... Element2n],
//    ...
//    GroupN: [ElementNa, ElementNb... ElementNn],
// }
//
// Two groups with overlapScore bigger than similarity_threshold will be merged
// together, with the subgroup being merged into the (larger) supergroup
function mergeSimilarGroups(similarity_threshold, genre_index) {

  // Returns tuple of overlapScores for [b-to-a, a-to-b]. This means, how much
  // overlap b has as a subgroup of a, and the other way around. The higher score
  // is the group with the most overlap (and, so, closer to being a subgroup of 
  // the other)
  // eg: overlapScore([1,2,3,4,5], [8,9,1]) = [0.25, 0.5]
  //     This means the second group is closer to being a subgroup of the first
  const overlapScore = (a, b) => {
    const superGroup = (a.length > b.length)? a : b;
    const subGroup = (a.length > b.length)? b : a;

    let duplicates = 0;
    for (const o of subGroup) {
      if (superGroup.includes(o)) {
        duplicates += 1;
      }
    }

    const uniquesSuper = superGroup.length - duplicates;
    const uniquesSub = subGroup.length - duplicates;
    const coverSuper = duplicates / uniquesSuper;
    const coverSub = duplicates / uniquesSub;

    return (a.length > b.length)?
                [coverSuper, coverSub] :
                [coverSub, coverSuper];
  }

  // This looks O(n^2 * avgGroupSize) but in practice after 1 or 2 steps of the
  // outer loop, most groups will have been merged into a few "winner" groups
  const all_gens_list = Array.from(genre_index.keys());
  const all_gen_cnt = all_gens_list.length;
  for (let gen_a_idx=0; gen_a_idx < all_gen_cnt; ++gen_a_idx) {
    const gen_a_name = all_gens_list[gen_a_idx];
    if (genre_index.get(gen_a_name) == null) {
      continue;
    }

    for (let gen_b_idx=gen_a_idx+1; gen_b_idx < all_gen_cnt; ++gen_b_idx) {
      const gen_b_name = all_gens_list[gen_b_idx];

      if (genre_index.get(gen_b_name) == null) {
        continue;
      }

      const overlap = overlapScore(genre_index.get(gen_a_name), genre_index.get(gen_b_name));
      const isSubgroup = (Math.max(overlap[0], overlap[1]) > similarity_threshold);
      const isCatMissing = (gen_a_name == CAT_MISSING_GROUP_NAME || gen_b_name == CAT_MISSING_GROUP_NAME);
      if (isSubgroup && isCatMissing) {
        console.error("Trying to merge", gen_a_name, "and", gen_b_name);
      }

      if (isSubgroup && !isCatMissing) {
        if (overlap[1] >= overlap[0]) {
          //console.log("    Merge ", gen_a_name, " <- ", gen_b_name);
          const catd = genre_index.get(gen_a_name).concat(genre_index.get(gen_b_name));
          const cat_uniq = Array.from(new Set(catd));
          genre_index.set(gen_a_name, cat_uniq);
          genre_index.set(gen_b_name, null);
        } else {
          //console.log("    Merge ", gen_a_name, " -> ", gen_b_name);
          const catd = genre_index.get(gen_b_name).concat(genre_index.get(gen_a_name));
          const cat_uniq = Array.from(new Set(catd));
          genre_index.set(gen_a_name, null);
          genre_index.set(gen_b_name, cat_uniq);
          // gen_a is now gone, break out of the inner loop to move to next
          break;
        }
      }
    }
  }

  filterNulls(genre_index);
}

// Given a list of genres, return a list of small genres (with size less than
// threhsold) and a list of big genres
function partitionGenres(size_threshold, genre_index) {
  const smallGens = new Map();
  const bigGens = new Map();
  for (const kv of genre_index.entries()) {
    const genName = kv[0];
    const genArts = kv[1];
    if (genArts.length > size_threshold) {
      bigGens.set(genName, genArts);
    } else {
      smallGens.set(genName, genArts);
    }
  }

  return {big: bigGens, small: smallGens};
}


// Will merge small groups into larger groups by
// 1. Getting related groups to a smallgroup (by getting the list of all
//    groups to which its members also belong)
// 2. Find out the biggest group from all related groups
// 3. Merge the small group into the biggest found group
// If no bigger group is found, the group is left unmodified
function mergeSmallGroups(small_group_threshold, gen_to_art, all_arts) {
  // Given a list of artists art_list, return all subgenres that belong to all of
  // the artists in the list
  function getRelatedGenres(art_list, all_arts) {
    const all_gens = new Set();
    for (const art of art_list) {
      for (const subgen of all_arts.get(art).genres) {
        all_gens.add(subgen);
      }
    }
    return all_gens;
  }

  // Return the biggest genre out of a list of genres
  function getBiggest(gen_list, gen_to_art_idx) {
    let biggest_cnt = 0;
    let biggest_gen = null;
    for (const gen of gen_list) {
      if (gen_to_art_idx.get(gen) && gen_to_art_idx.get(gen).length > biggest_cnt) {
        biggest_cnt = gen_to_art_idx.get(gen).length;
        biggest_gen = gen;
      }
    }

    return biggest_gen;
  }

  const gens = partitionGenres(small_group_threshold, gen_to_art);
  for (const small_gen of gens.small.keys()) {
    const art_lst = gen_to_art.get(small_gen);
    const related_gens = getRelatedGenres(art_lst, all_arts);
    const biggest_related = getBiggest(related_gens, gen_to_art);

    // If the biggest subgroup is one of the large groups, merge it
    if (biggest_related != null && gens.big.has(biggest_related) && biggest_related != small_gen) {
      // console.log("Merge", small_gen, "into", biggest_related);
      for (const art of art_lst) {
        // console.log("Push", art, "into", biggest_related);
        gen_to_art.get(biggest_related).push(art);
      }
      gen_to_art.set(small_gen, null);
    }
  }

  filterNulls(gen_to_art);
}

// Will group all artists that remain uncategorized under a "misc" category
function groupSmallCategories(small_group_threshold, gen_to_art, all_arts) {
  let miscArts = new Set();
  const gens = partitionGenres(small_group_threshold, gen_to_art);
  for (const smallGenKV of gens.small.entries()) {
    const smallGenArts = smallGenKV[1];
    for (const artName of smallGenArts) {
      let hasGen = false;
      for (const bigGenKV of gens.big.entries()) {
        const bigGenArts = bigGenKV[1];
        if (artName in bigGenArts) {
          hasGen = true;
          break;
        }
      }

      if (!hasGen) {
        miscArts.add(artName);
      } else {
        console.error("Artist", artName, "is safe to delete (this shouldn't happen, it should have been deleted already)");
      }
    }
  }

  miscArts = Array.from(miscArts);
  if (gen_to_art.has(CAT_MISC_GROUP_NAME)) {
    miscArts = gen_to_art.get(CAT_MISC_GROUP_NAME).concat(miscArts);
  }
  gen_to_art.set(CAT_MISC_GROUP_NAME, miscArts);

  for (const smallGenKV of gens.small.entries()) {
    const smallGenName = smallGenKV[0];
    gen_to_art.set(smallGenName, null);
  }

  filterNulls(gen_to_art);
}

function guessGroupFromStrings(use_partial_match, gen_idx, arts_idx) {
  // Don't relly on these common words
  const keyword_blocklist = ['dark', 'wave', 'indie'];

  function stringyArt(gen_idx, catName) {
    const artToStrings = new Map();
    const miscArtNames = Array.from(gen_idx.get(catName).values());
    for (const art_name of miscArtNames) {
      let kwds = new Set(art_name.split(/[\s,-]+/));
      for (const genName of arts_idx.get(art_name).genres) {
        for (const tok of genName.split(/[\s,-]+/)) {
          if (tok.length > 3 && !keyword_blocklist.includes(tok)) {
            kwds.add(tok);
          }
        }
      }

      artToStrings.set(art_name, Array.from(kwds));
    }
    return artToStrings;
  }

  const artStrings = stringyArt(gen_idx, CAT_MISC_GROUP_NAME);
  for (const kv of artStrings) {
    const artName = kv[0];
    const strings = kv[1];

    for (const genName of gen_idx.keys()) {
      let atleastOneMatch = false;
      for (const stringy of strings) {
        const match = (genName == stringy) || (use_partial_match && genName.includes(stringy));
        atleastOneMatch = atleastOneMatch | match;
        if (match) {
          gen_idx.get(genName).push(artName);
        }
      }
      if (atleastOneMatch) {
        const newMiscGroup = gen_idx.get(CAT_MISC_GROUP_NAME).filter(x => x != artName);
        gen_idx.set(CAT_MISC_GROUP_NAME, newMiscGroup);
      }
    }
  }
}

export function groupAndIndexGenres(raw_arts) {
  const arts_idx = indexArts(raw_arts);
  const genres_idx = indexGenToArt(raw_arts);

  mergeSimilarGroups(GROUP_SIMILARITY_THRESHOLD, genres_idx);
  mergeSmallGroups(GROUP_IS_SMALL_THRESHOLD, genres_idx, arts_idx);
  groupSmallCategories(GROUP_IS_SMALL_THRESHOLD, genres_idx, arts_idx);
  // Try to "rescue" entries from the misc category
  guessGroupFromStrings(false, genres_idx, arts_idx);
  guessGroupFromStrings(true, genres_idx, arts_idx);
  /*
  groupSmallCategories(GROUP_IS_SMALL_SECOND_STEP_THRESHOLD, genres_idx, arts_idx);
  guessGroupFromStrings(false, genres_idx, arts_idx);
  guessGroupFromStrings(true, genres_idx, arts_idx);
  */

  // Count of artists over all categories
  const categorizedArts = new Set();
  for (const art_list of genres_idx.values()) {
    if (art_list != null) {
      for (const art of art_list) {
        categorizedArts.add(art)
      }
    }
  }

  return {
    artistIndex: arts_idx,
    genresIndex: genres_idx,
    artsCount: arts_idx.size,
    rawArtsTotal: raw_arts.length,
    categorizedArts: categorizedArts.size,
  };
}

export function getInterestingAttrsFromSpotifyArtistList(spotifyArtList) {
  function getInterestingAttrsFromSpotifyArtist(spotifyArt) {
    const interestingAttrs = ['id', 'name', 'uri', 'genres', 'images'];
    const obj = {};
    for (let attr of interestingAttrs) {
      obj[attr] = spotifyArt[attr];
    }
    return obj;
  }

  return spotifyArtList.map(getInterestingAttrsFromSpotifyArtist);
}


