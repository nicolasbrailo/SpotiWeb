
function indexArts(raw_arts) {
  const idx = {};
  for (let art of raw_arts) {
    idx[art.name] = art;
  }
  return idx;
}

function indexGenToArt(raw_arts) {
  const genIdx = {};
  for (let art of raw_arts) {
    for (let gen of art.genres) {
      if (gen in genIdx) {
        genIdx[gen].push(art.name);
      } else {
        genIdx[gen] = [art.name];
      }
    }
  }
  return genIdx;
}

// Remove keys pointing to null from a dictionary
function filterNulls(l) {
  const compressed = {};
  for (let x of Object.keys(l)) {
    if (l[x]) compressed[x] = l[x];
  }
  return compressed;
}

// Returns tuple of overlapScores for [b-to-a, a-to-b]. This means, how much
// overlap b has as a subgroup of a, and the other way around. The higher score
// is the group with the most overlap (and, so, closer to being a subgroup of 
// the other)
// eg: overlapScore([1,2,3,4,5], [8,9,1]) = [0.25, 0.5]
//     This means the second group is closer to being a subgroup of the first
window.overlapScore = (a, b) => {
  const superGroup = (a.length > b.length)? a : b;
  const subGroup = (a.length > b.length)? b : a;

  let duplicates = 0;
  for (let o of subGroup) {
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

// Merge "similar" groups, where similarity is defined by overlapScore
//
// gen_to_art is a dictionary like
//  {
//    Group1: [Element1a, Element1b... Element1n],
//    Group2: [Element2a, Element2b... Element2n],
//    ...
//    GroupN: [ElementNa, ElementNb... ElementNn],
// }
//
// Two groups with overlapScore bigger than similarity_threshold will be merged
// together, with the subgroup being merged into the (larger) supergroup
function mergeSimilarGroups(similarity_threshold, gen_to_art) {
  // This looks O(n^2 * avgGroupSize) but in practice after 1 or 2 steps of the
  // outer loop, most groups will have been merged into a few "winner" groups
  const genres = Object.keys(gen_to_art);
  for (let i=0; i < genres.length; ++i) {
    const gen_a_name = genres[i];
    let gen_a_arts = gen_to_art[gen_a_name];
    if (gen_a_arts) {
      for (let j=i+1; j < genres.length; ++j) {
        const gen_b_name = genres[j];
        const gen_b_arts = gen_to_art[gen_b_name];
        if (gen_b_arts) {
          const overlap = overlapScore(gen_a_arts, gen_b_arts);
          const isSubgroup = (Math.max(overlap[0], overlap[1]) > similarity_threshold);
          if (isSubgroup) {
            //console.log("Soubgroup", gen_a_name, gen_a_arts, gen_b_name, gen_b_arts, overlap);
            if (overlap[1] >= overlap[0]) {
              //console.log("    Merge ", gen_a_name, " <- ", gen_b_name);
              gen_to_art[gen_a_name].concat(gen_b_arts);
              gen_a_arts = gen_to_art[gen_a_name];
              gen_to_art[gen_b_name] = null;
            } else {
              //console.log("    Merge ", gen_a_name, " -> ", gen_b_name);
              gen_to_art[gen_b_name].concat(gen_a_arts);
              gen_to_art[gen_a_name] = null;
              break;
            }
          }
        }
      }
    }
  }

  return filterNulls(gen_to_art);
}

// Given a list of genres, return a list of small genres (with size less than
// threhsold) and a list of big genres
function partitionGenres(size_threshold, gen_list) {
  let small_gens = {};
  let big_gens = {};
  const genres = Object.keys(gen_list);
  for (let i=0; i < genres.length; ++i) {
    const small_gen_name = genres[i];
    if (gen_list[small_gen_name].length <= size_threshold) {
      small_gens[small_gen_name] = gen_list[small_gen_name];
    } else {
      big_gens[small_gen_name] = gen_list[small_gen_name];
    }
  }

  return {big: big_gens, small: small_gens};
}

// Given a list of artist art_list, return all subgenres that belong to all of
// the artists in the list
function getRelatedGenres(art_list, all_arts) {
  let all_gens = [];
  for (let art of art_list) {
    all_gens = all_gens.concat(all_arts[art].genres);
  }
  return all_gens;
}

// Return the biggest genre out of a list of genres
function getBiggest(gen_list, gen_to_art_idx) {
  let biggest_cnt = 0;
  let biggest_gen = null;
  for (let gen of gen_list) {
    if (gen_to_art_idx[gen] && gen_to_art_idx[gen].length > biggest_cnt) {
      biggest_cnt = gen_to_art_idx[gen].length;
      biggest_gen = gen;
    }
  }

  return biggest_gen;
}

// Will merge small groups into larger groups by
// 1. Getting related groups to a smallgroup (by getting the list of all
//    groups to which its members also belong)
// 2. Find out the biggest group from all related groups
// 3. Merge the small group into the biggest found group
// If no bigger group is found, the group is left unmodified
function mergeSmallGroups(small_group_threshold, gen_to_art, all_arts) {
  const gens = partitionGenres(small_group_threshold, gen_to_art);
  for (let small_gen of Object.keys(gens.small)) {
    const art_lst = gen_to_art[small_gen];
    const related_gens = getRelatedGenres(art_lst, all_arts);
    const biggest_related = getBiggest(related_gens, gen_to_art);

    // If the biggest subgroup is one of the large groups, merge it
    if (biggest_related && gens.big[biggest_related] && biggest_related != small_gen) {
      gens.big[biggest_related].concat(art_lst);
      gens.small[small_gen] = null;
    }
  }

  return {genres: gens.big, uncategorized: filterNulls(gens.small)};
}

// Will group all artists that remain uncategorized under a "misc" category
function groupUncategorized(maybe_uncategorized, all_arts, all_genres) {
  function isArtistCategorized(artist) {
    for (let gen of artist.genres) {
      if (gen in all_genres) return true;
    }
    return false;
  }

  if (!all_genres.misc) all_genres.misc = [];
  for (let gen of Object.keys(maybe_uncategorized)) {
    const maybe_uncategorized_arts = maybe_uncategorized[gen];
    for (let art_name of maybe_uncategorized_arts) {
      const art = all_arts[art_name];
      if (!isArtistCategorized(art)) {
        // This artist doesn't belong to any other genre, group it under misc
        all_genres.misc.push(art_name);
      }
    }
  }

  return all_genres;
}

function guessGroupFromStrings(use_fuzzy_match, gen_idx, arts_idx) {
  // Don't relly on these common words when fuzzy matching
  const fuzzy_blocklist = ['dark', 'wave', 'indie'];

  for (let art_name of gen_idx.misc) {
    let strings = art_name.split(/[\s,-]+/);
    for (let gen of arts_idx[art_name].genres) {
      strings = strings.concat(gen.split(/[\s,-]+/));
    }

    (() => {
      for (let gen of Object.keys(gen_idx)) {
        for (let k of strings) {
          let match = false;
          if (use_fuzzy_match) {
            match = ((k.length > 3) && (!fuzzy_blocklist.includes(k)) && gen.includes(k));
          } else {
            match = (gen == k);
          }

          if (match) {
            gen_idx[gen].push(art_name);
            gen_idx.misc.splice(gen_idx.misc.indexOf(art_name), 1);
            return;
          }
        }
      }
    })();
  }

  return gen_idx;
}

function sortGroups(l) {
  let sorted = {};
  for (let k of Object.keys(l)) {
    sorted[k] = l[k].sort();
  }
  return sorted;
}

const SIMILARITY_THRESHOLD = .9;
const GROUP_IS_SMALL_THRESHOLD = 4;
const GROUP_IS_SMALL_SECOND_STEP_THRESHOLD = 8;

export function groupAndIndexGenres(raw_arts) {
  console.log("Generating indexes");
  const arts_idx = indexArts(raw_arts);
  const gens_idx = indexGenToArt(raw_arts);

  console.log(`Groupping and indexing genres. Have ${Object.keys(gens_idx).length} genres.`);
  const g1 = mergeSimilarGroups(SIMILARITY_THRESHOLD, gens_idx);
  const g2 = mergeSmallGroups(GROUP_IS_SMALL_THRESHOLD, g1, arts_idx);
  const g3 = groupUncategorized(g2.uncategorized, arts_idx, g2.genres);
  const g4 = guessGroupFromStrings(false, g3, arts_idx);
  const g5 = guessGroupFromStrings(true, g4, arts_idx);

  const g6 = mergeSmallGroups(GROUP_IS_SMALL_SECOND_STEP_THRESHOLD, g5, arts_idx);
  for (let k of Object.keys(g6.uncategorized)) {
    g6.genres[k] = g6.uncategorized[k];
  }
  const lst = sortGroups(g6.genres);
  console.log(`Finished: Have ${Object.keys(lst).length} genres and ${lst.misc?.length} uncategorized artists.`);

  return {
    artist_index: arts_idx,
    genres_index: lst,
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

window.getInterestingAttrsFromSpotifyArtistList = getInterestingAttrsFromSpotifyArtistList;
window.groupAndIndexGenres = groupAndIndexGenres;
window.foobar = () => {
  window.rawlst = JSON.parse(localStorage.fullArtLst);
  window.rawlst = getInterestingAttrsFromSpotifyArtistList(rawlst)
  window.arts = groupAndIndexGenres(rawlst);
};
