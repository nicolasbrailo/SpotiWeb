import json
import os
import pickle
import spotipy
import spotipy.util as util
import sys

def dbg_prettyprint(x):
    print(json.dumps(x, indent=2, sort_keys=True))

try:
    with open('config.json', 'r') as fp:
        CFG = json.loads(fp.read())
except:
    print("Config file not found. Please read the README")
    exit(1)

#sp_scopes = "app-remote-control user-read-playback-state user-modify-playback-state user-read-currently-playing user-library-read user-follow-read"
AUTH = spotipy.oauth2.SpotifyOAuth(
        scope="user-follow-read",
        username=CFG["sp_username"],
        client_id=CFG["sp_client_id"],
        client_secret=CFG["sp_client_secret"],
        redirect_uri=CFG["sp_redirect_uri"],
        open_browser=False)

if True:
    test = spotipy.Spotify(auth_manager=AUTH).current_user_followed_artists(limit=1)
    if not test or 'artists' not in test or 'items' not in test['artists']:
        print("Didn't receive a valid response from Spotipy. Expected {artists: { items: [] }}, received " + str(test))
        exit(1)

    if not len(test['artists']) > 0:
        print("No artists were found, can't continue")
        exit(1)


class ArtistIndex(object):
    def _get_all_artists(self, sp):
        IMG_TARGET_SIDE_LENGTH = 200
        def map_artists(lst):
            def pick_image(images, target_side_length):
                if len(images) == 0:
                    return None
                # Pick image closest to the area of target_side_length
                tgt_area = target_side_length * target_side_length
                areas = [(x["width"] * x["height"]) - tgt_area for x in images]
                min_idx = 0
                for i in range(0, len(areas)):
                    if abs(areas[i]) < abs(areas[min_idx]):
                        min_idx = i
                return images[min_idx]["url"]

            def map_art(a):
                new = {}
                new["id"] = a["id"]# .encode('utf-8')
                new["name"] = a["name"]# .encode('utf-8')
                new["uri"] = a["uri"] # a["external_urls"]["spotify"]
                new["img"] = pick_image(a["images"], IMG_TARGET_SIDE_LENGTH)
                new["genres"] = a["genres"]
                return new
            return [map_art(x) for x in lst]

        print("Start Spotify fetch")
        r = sp.current_user_followed_artists(limit=50)
        lst = map_artists(r["artists"]["items"])
        cont = r["artists"]["cursors"]["after"]
        while cont is not None:
            r = sp.current_user_followed_artists(limit=50, after=cont)
            lst += map_artists(r["artists"]["items"])
            cont = r["artists"]["cursors"]["after"]

        print("End Spotify fetch, got {} artists".format(len(lst)))
        return lst

    def _cached_get_all_artists(self, sp):
        try:
            with open(self._CACHE_FILE, "rb" ) as fp:
                return pickle.load(fp)
        except IOError:
            print("Couldn't found artists cache, will fetch all artists (this is a slow operation)")
            lst = self._get_all_artists(sp)
            with open(self._CACHE_FILE, "wb+" ) as fp:
                pickle.dump(lst, fp)
            return lst

    def _index_artists_by_genre(self, lst):
        arts_by_genre = {}
        for art in lst:
            for gen in art["genres"]:
                try:
                    arts_by_genre[gen].append(art["name"])
                except KeyError:
                    arts_by_genre[gen] = [art["name"]]
        return arts_by_genre

    def _index_artists_by_name(self, lst):
        arts = {}
        for art in lst:
            arts[art["name"]] = art
        return arts

    def __init__(self, sp, force_cache_clean=False):
        self._CACHE_FILE = "arts.pickle"
        if force_cache_clean:
            try:
                print("Removed cache")
                os.remove(self._CACHE_FILE)
            except:
                print("Failed to clean arts cache")

        lst = self._cached_get_all_artists(sp)
        self._arts_by_genre = self._index_artists_by_genre(lst)
        self._arts_by_name = self._index_artists_by_name(lst)
        #self._sorted_gens = sorted(self._arts_by_genre, key=lambda x: len(self._arts_by_genre[x]))

    def get_genres(self):
        return list(self._arts_by_genre.keys())

    def get_all_artists(self):
        return self._arts_by_name

    def get_all_artists_by_genre(self):
        return self._arts_by_genre

    def add_genre(self, g):
        if g not in self._arts_by_genre:
            self._arts_by_genre[g] = []

    def get_artists_for_genre(self, gen):
        return self._arts_by_genre[gen]

    def get_artist(self, name):
        return self._arts_by_name[name]

    def merge_subgenre_into_genre(self, subgenre, merge_into):
        if merge_into not in self._arts_by_genre or subgenre not in self._arts_by_genre:
            # Subgenre may have already been merged to another
            return False

        for art in self._arts_by_genre[subgenre]:
            if subgenre not in self._arts_by_name[art]["genres"]:
                self._arts_by_name[art]["genres"].append(subgenre)

            if art not in self._arts_by_genre[merge_into]:
                self._arts_by_genre[merge_into].append(art)

        del self._arts_by_genre[subgenre]
        return True

    def destructive_remove(self, genre):
        """ Removes a genre from the genres index and also from the genre list of
        each artist. This is useful so successive queries to the genres of an
        artist won't return this genre anymore. merge_subgenre_into_genre
        will delete the genre from the index but preserve the genre in the
        artists index """
        for art in self._arts_by_genre[genre]:
            self._arts_by_name[art]["genres"].remove(genre)

        del self._arts_by_genre[genre]


class GenreMerger(object):
    def _get_largest_genre(self, idx, genre_list):
        selected_gen = None
        selected_gen_cnt = 0
        for gen in genre_list:
            cnt = len(idx.get_artists_for_genre(gen))
            if cnt > selected_gen_cnt:
                selected_gen = gen 
                selected_gen_cnt = cnt
        return selected_gen

    def _get_genre_subset_score(self, idx, superset, subset):
        sup_s_arts = idx.get_artists_for_genre(superset)
        sub_s_arts = idx.get_artists_for_genre(subset)

        contained = 0.0
        for art in sub_s_arts:
            if art in sup_s_arts:
                contained += 1.0

        return contained / len(sub_s_arts)

class GenreSimilarityMerger(GenreMerger):
    def __init__(self, max_subgenre_merge_size, subset_score_threshold):
        # Max size before a subgenre is considered for merging into a larger group
        self._max_subgenre_merge_size = max_subgenre_merge_size
        # Minimum similarity score to consider a genre a subset of other
        self._subset_score_threshold = subset_score_threshold

    def apply_to(self, arts_idx):
        merge_cnt = 0
        merge_map = self._get_genres_merge_map(arts_idx)
        for subset in merge_map.keys():
            if arts_idx.merge_subgenre_into_genre(subset, merge_map[subset]):
                merge_cnt += 1
        return merge_cnt

    def _get_genres_subsets(self, idx):
        subsets = []
        for sups in idx.get_genres():
            for subs in idx.get_genres():
                if sups != subs:
                    score = self._get_genre_subset_score(idx, sups, subs)
                    art_cnt = len(idx.get_artists_for_genre(subs))
                    if score > self._subset_score_threshold and art_cnt < self._max_subgenre_merge_size:
                        subsets.append({"subset": subs, "superset": sups, "score": score})
        return subsets

    def _get_genres_merge_map(self, idx):
        """  From all possible merge supersets, pick the largest """
        all_merges = {}
        for subset in self._get_genres_subsets(idx):
            try:
                all_merges[subset["subset"]].append(subset["superset"])
            except KeyError:
                all_merges[subset["subset"]] = [ subset["superset"] ]

        merge_subset_to = {}
        for subset in all_merges.keys():
            merge_subset_to[subset] = self._get_largest_genre(idx, all_merges[subset])

        return merge_subset_to

class SmallGenreMerger(GenreMerger):
    """ Remove small genres by asigning their contents to the largest supergroup """
    def __init__(self, subgenre_min_size):
        self._subgenre_min_size = subgenre_min_size

    def apply_to(self, arts_idx):
        merge_cnt = 0
        for gen in list(arts_idx.get_genres()):
            cnt = len(arts_idx.get_artists_for_genre(gen))
            safe_del = self._safe_to_delete(arts_idx, gen)
            if cnt <= self._subgenre_min_size and safe_del:
                arts_idx.destructive_remove(gen)
                merge_cnt += 1
        return merge_cnt

    def _safe_to_delete(self, idx, gen):
        for art in idx.get_artists_for_genre(gen):
            art_gens = list(idx.get_artist(art)["genres"])
            try:
                art_gens.remove(gen)
            except ValueError:
                pass
            if len(art_gens) == 0:
                return False
        return True

class GenreCustomRulesMerger(GenreMerger):
    def __init__(self, merge_rules_map):
        self._merge_map = merge_rules_map

    def apply_to(self, arts_idx):
        cnt = 0
        for rule in self._merge_map:
            merge_to = rule["genre"]
            for merge_from in rule["subgenres"]:
                arts_idx.merge_subgenre_into_genre(merge_from, merge_to)
                cnt += 1
        return cnt

class TinyGroupMerger(GenreMerger):
    """ Remove tiny genres by asigning their contents to the a 'misc' supergroup """
    def __init__(self, subgenre_min_size=2):
        self._TARGET_GENRE = "misc"
        self._subgenre_min_size = subgenre_min_size

    def apply_to(self, arts_idx):
        merge_cnt = 0
        arts_idx.add_genre(self._TARGET_GENRE)
        for gen in list(arts_idx.get_genres()):
            cnt = len(arts_idx.get_artists_for_genre(gen))
            if cnt <= self._subgenre_min_size:
                arts_idx.merge_subgenre_into_genre(gen, self._TARGET_GENRE)
                merge_cnt += 1
        return merge_cnt

class Indexer(object):
    def __init__(self, sp, custom_genre_merge_rules):
        self.sp = sp
        self.custom_genre_merge_rules = custom_genre_merge_rules
        self.GENRE_MIN_SIZE = 5
        self.SUBSET_SCORE_THRESHOLD = 0.5
        self.MAX_SUBGENRE_MERGE_SIZE = 20
        self.refresh_index()

    def refresh_index(self, force_cache_clean=False):
        self.idx = ArtistIndex(self.sp, force_cache_clean)
        print("IDX has {} genres".format(len(self.idx.get_genres())))
        cnt = GenreCustomRulesMerger(self.custom_genre_merge_rules).apply_to(self.idx)
        print("Removed {} genres".format(cnt))
        cnt = SmallGenreMerger(self.GENRE_MIN_SIZE).apply_to(self.idx)
        print("Removed {} genres".format(cnt))
        cnt = GenreSimilarityMerger(self.MAX_SUBGENRE_MERGE_SIZE, self.SUBSET_SCORE_THRESHOLD).apply_to(self.idx)
        print("Removed {} genres".format(cnt))
        cnt = GenreSimilarityMerger(self.MAX_SUBGENRE_MERGE_SIZE, self.SUBSET_SCORE_THRESHOLD).apply_to(self.idx)
        print("Removed {} genres".format(cnt))
        cnt = TinyGroupMerger().apply_to(self.idx)
        print("Removed {} genres".format(cnt))
        print("IDX has {} genres".format(len(self.idx.get_genres())))

from flask import Flask, send_from_directory, redirect, url_for
flask_app = Flask(__name__, static_url_path='')
idx = Indexer(spotipy.Spotify(auth_manager=AUTH), CFG["custom_genre_merge_rules"])

@flask_app.route('/api/refresh')
def flask_ep_refresh():
    idx.refresh_index(force_cache_clean=True)
    return redirect(url_for('flask_ep_home'))

@flask_app.route('/api/fetch_all')
def flask_jsapi_fetch_all():
    return json.dumps({
            'genres': idx.idx.get_genres(),
            'artists': idx.idx.get_all_artists(),
            'artists_by_genre': idx.idx.get_all_artists_by_genre(),
        })

@flask_app.route('/api/get_tok')
def flask_jsapi_get_tok():
    tok = AUTH.get_cached_token()['access_token']
    return json.dumps({'Authorization': f'Bearer {tok}'})

@flask_app.route('/')
def flask_ep_home():
    return send_from_directory('./webapp/', 'index.html')

@flask_app.route('/favicon.ico')
def flask_ep_favicon():
    return send_from_directory('./webapp/', 'favicon.ico')

@flask_app.route('/webapp/<path:urlpath>')
def flask_webapp_root(urlpath):
    return send_from_directory('./webapp/', urlpath)

flask_debug_mode = CFG['flask_debug_mode'] if 'flask_debug_mode' in CFG else False
flask_app.run(host=CFG['listen_host'], port=CFG['listen_port'], debug=flask_debug_mode)

