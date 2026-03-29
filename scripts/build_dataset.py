#!/usr/bin/env python3

from __future__ import annotations

import json
import re
import time
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
UML_PATH = ROOT / "data" / "data.uml"
GRAPH_PATH = ROOT / "data" / "graph.json"
CACHE_PATH = ROOT / "data" / "itunes_cache.json"
TITLE_MAP_PATH = ROOT / "data" / "title-map.json"

ARTIST_NAME = "ずっと真夜中でいいのに。"
USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36"

WORK_ALIASES = {
    "Dear. Mr「F」": "Dear Mr F",
    "성계와 밤": "雲丹と栗",
    "綺羅キラー (feat. Mori Calliope)": "綺羅キラー",
    "またね幻 (Live in Studio_80光年先の君へ)": "またね幻",
    "クリームで会いにいけますか (Disco Re-Edit)": "クリームで会いにいけますか",
    "クズリ念 (Live in Studio_ 温蔵庫)": "クズリ念",
    "クズリ念 (Live in Studio_温蔵庫)": "クズリ念",
    "ハゼ馳せる果てるまで(抗いハゼフライ定食)": "ハゼ馳せる果てるまで",
    "暗く黒く(強)": "暗く黒く",
    "消えてしまいそうです(1970s)": "消えてしまいそうです",
    "クズリ念(肯定)": "クズリ念",
    "暗く黒く(Crack Clock)": "暗く黒く",
    "乏しいDNAだけ(愚)": "眩しいDNAだけ",
    "居眠り遠征隊(即興)": "居眠り遠征隊",
    "繰り返す収穫(即興)": "繰り返す収穫",
    "勘ぐれい(ヤンキーver.)": "勘ぐれい",
    "脳裏上のクラッカー (セッション紹介)": "脳裏上のクラッカー",
}

SEARCH_TITLE_OVERRIDES = {
    "形藻土": "KEISOUDO",
    "正しい偽りからの起床": "Tadashii Itsuwarikarano Kishou",
    "今は今で誓いは笑みで": "Imawa Imade Chikaiwa Emide",
    "朗らかな皮膚とて不服": "Hogarakana Hifutote Fufuku",
    "伸び仕草懲りて暇乞い": "Nobi Shigusa Korite Itomagoi",
    "虚仮の一念海馬に託す": "Koke no ichinen Kaiba ni takusu",
    "潜潜話": "Hisohiso Banashi",
    "ぐされ": "Gusare",
    "沈香学": "沈香学",
    "本格中華喫茶・愛のペガサス ~羅武の香辛龍~": 'AUTHENTIC CHINESE KISSA "Ai no Pegasus" -SPICY DRAGON OF LOVE-',
    "永遠深夜万博「名巧は愚なるが如し」": "MIDNIGHT FOREVER EXPO ‘MEIKŌ WA GUNARUGA GOTOSHI’ (Live)",
    "Dear. Mr「F」": "Dear Mr F",
    "クズリ念 (Live in Studio_ 温蔵庫)": "クズリ念",
    "クリームで会いにいけますか (Disco Re-Edit)": "クリームで会いにいけますか",
}

SINGLE_SEARCH_OVERRIDES = {
    "形": "形",
    "クズリ念": "クズリ念",
    "よもすがら": "よもすがら",
}

SINGLE_COLLECTION_OVERRIDES = {
    "秒針を噛む": "Byoushinwo Kamu - Single",
    "秒針を噛む - From THE FIRST TAKE": "Byoushinwo Kamu (From The First Take) - Single",
    "脳裏上のクラッカー": "Nouriueno Cracker - Single",
    "眩しいDNAだけ": "Mabushii DNA Dake - Single",
    "正義": "Seigi - Single",
    "お勉強しといてよ": "Obenkyou Shitoiteyo - Single",
    "暗く黒く": "Darken - Single",
    "勘ぐれい": "Hunch Gray - Single",
    "正しくなれない": "Can't Be Right - Single",
    "正しくなれない - From THE FIRST TAKE": "Can't Be Right (From The First Take) - Single",
    "あいつら全員同窓会": "Inside Joke - Single",
    "ばかじゃないのに": "Stay Foolish - Single",
    "猫リセット": "Neko Reset - Single",
    "ミラーチューン": "Mirror Tune - Single",
    "消えてしまいそうです": "Blush - Single",
    "夏枯れ": "Summer Slack - Single",
    "残機": "Time Left - Single",
    "綺羅キラー": "Kira Killer (feat. Mori Calliope) - Single",
    "不法侵入": "INTRUSION - Single",
    "Blues in the Closet": "Blues in the Closet - Single",
    "微熱魔": "Warmthaholic - Single",
    "メディアノーチェ": "Medianoche - Single",
    "形": "Pain Give Form - Single",
    "嘘じゃない": "Truth In Lies - Single",
    "有心論": "Yushinron - Single",
    "シェードの埃は延長": "SHADE - Single",
    "海馬成長痛": "Hippocampal Pain - Single",
}

SINGLE_ART_FALLBACK_ALBUMS = {
    "勘冴えて悔しいわ": "今は今で誓いは笑みで",
    "こんなこと騒動": "潜潜話",
    "ハゼ馳せる果てるまで": "潜潜話",
    "蹴っ飛ばした毛布": "潜潜話",
    "過眠": "朗らかな皮膚とて不服",
    "低血ボルト": "朗らかな皮膚とて不服",
    "正しくなれない": "ぐされ",
    "TAIDADA": "虚仮の一念海馬に託す",
    "Blues in the Closet": "虚仮の一念海馬に託す",
    "花一匁": "沈香学",
    "よもすがら": "形藻土",
}

ALBUM_KIND_TEXT = {
    "mini": "Mini Album",
    "full": "Full Album",
    "tour": "Blu-ray / Live Session",
}

MANUAL_ALBUM_METADATA = {
    "THE FIRST TAKE": {
        "releaseDate": "2021-03-05",
        "collectionName": "THE FIRST TAKE",
        "artworkSingleTitle": "秒針を噛む - From THE FIRST TAKE",
    },
    "NIWA TO NIRA": {
        "releaseDate": "2021-02-10",
        "collectionName": "NIWA TO NIRA",
        "artworkSingleTitle": "秒針を噛む",
    },
    "YAKI YAKI YANKEE TOUR CLEANING LABO": {
        "releaseDate": "2021-12-15",
        "collectionName": "YAKI YAKI YANKEE TOUR CLEANING LABO",
        "artworkSingleTitle": "MILABO",
    },
    "CLEANING LABO": {
        "releaseDate": "2022-05-25",
        "collectionName": "CLEANING LABO",
        "artworkSingleTitle": "お勉強しといてよ",
    },
    'ZUTOMAYO FACTORY day1 "memory_limit =1"': {
        "releaseDate": "2023-05-03",
        "collectionName": 'ZUTOMAYO FACTORY day1 "memory_limit =1"',
        "artworkSingleTitle": "ミラーチューン",
    },
    'ZUTOMAYO FACTORY day2 "ob_start"': {
        "releaseDate": "2023-05-04",
        "collectionName": 'ZUTOMAYO FACTORY day2 "ob_start"',
        "artworkSingleTitle": "ミラーチューン",
    },
    "ROAD GAME #Techno Poor": {
        "releaseDate": "2023-10-25",
        "collectionName": "ROAD GAME #Techno Poor",
        "artworkSingleTitle": "残機",
    },
    "元素どろ団子TOUR": {
        "releaseDate": "2024-02-21",
        "collectionName": "元素どろ団子TOUR",
        "artworkSingleTitle": "不法侵入",
    },
    "本格中華喫茶・愛のペガサス Blu-ray": {
        "releaseDate": "2024-09-11",
        "collectionName": "本格中華喫茶・愛のペガサス Blu-ray",
        "artworkSingleTitle": "花一匁",
    },
    "原始五年巡回公演「喫茶・愛のペガサス」": {
        "releaseDate": "2024-10-09",
        "collectionName": "原始五年巡回公演「喫茶・愛のペガサス」",
        "artworkSingleTitle": "花一匁",
    },
    "やきやきヤンキーツアー2 〜スナネコ建設の磨き仕上げ〜 Blu-ray": {
        "releaseDate": "2025-05-21",
        "collectionName": "やきやきヤンキーツアー2 〜スナネコ建設の磨き仕上げ〜 Blu-ray",
        "artworkSingleTitle": "形",
    },
    "やきやきヤンキーツアー2 〜スナネコ建設の磨き仕上げ〜 Live": {
        "releaseDate": "2025-09-03",
        "collectionName": "やきやきヤンキーツアー2 〜スナネコ建設の磨き仕上げ〜 Live",
        "artworkSingleTitle": "TAIDADA",
    },
    "コズミックどろ団子TOUR": {
        "releaseDate": "2026-02-18",
        "collectionName": "コズミックどろ団子TOUR",
        "artworkSingleTitle": "Blues in the Closet",
    },
    "OMOTE EXPO 2025「名巧は愚なるが如し」": {
        "releaseDate": "2025-09-02",
        "collectionName": "OMOTE EXPO 2025「名巧は愚なるが如し」",
        "artworkSingleTitle": "TAIDADA",
    },
}

LIVE_SUFFIX_PATTERNS = [
    re.compile(r" \((?:Live|Live in Studio_.+?)\)$"),
    re.compile(r" \(.+? / LIVE\)$"),
    re.compile(r" \[.+? / LIVE\]$"),
    re.compile(r" \[Live\]$"),
]


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    normalized = normalized.lower()
    normalized = re.sub(r"[^\w]+", "-", normalized, flags=re.UNICODE)
    normalized = normalized.strip("-")
    return normalized or "item"


def iso_to_date(value: str) -> str:
    return value[:10]


def upscale_art(url: str | None, size: int = 900) -> str | None:
    if not url:
        return None
    return re.sub(r"/\d+x\d+bb\.", f"/{size}x{size}bb.", url)


def extract_artwork_url(item: dict[str, Any]) -> str | None:
    return upscale_art(item.get("artworkUrl100") or item.get("artworkUrl"))


def load_title_map() -> dict[str, dict[str, str]]:
    return json.loads(TITLE_MAP_PATH.read_text())


def flatten_title_map(title_map: dict[str, dict[str, str]]) -> dict[str, str]:
    merged: dict[str, str] = {}
    for group in title_map.values():
        merged.update(group)
    return merged


def get_korean_title(title: str | None, title_map: dict[str, str]) -> str | None:
    if not title:
        return None
    alias = title_map.get(title)
    if alias and alias != title:
        return alias
    return None


def build_artwork_path(kind: str, title: str) -> str:
    folder = "singles" if kind == "single" else "albums"
    return f"asset/artwork/{folder}/{slugify(title)}.jpg"


def canonicalize_work_title(value: str) -> str:
    title = value.strip()

    if title in WORK_ALIASES:
        return WORK_ALIASES[title]

    normalized = title
    for pattern in LIVE_SUFFIX_PATTERNS:
        normalized = pattern.sub("", normalized)

    return WORK_ALIASES.get(normalized, normalized)


class AppleSearch:
    def __init__(self, cache_path: Path) -> None:
        self.cache_path = cache_path
        if cache_path.exists():
            self.cache: dict[str, Any] = json.loads(cache_path.read_text())
        else:
            self.cache = {}

    def save(self) -> None:
        self.cache_path.write_text(
            json.dumps(self.cache, ensure_ascii=False, indent=2) + "\n"
        )

    def search(self, term: str, entity: str, limit: int = 12) -> list[dict[str, Any]]:
        key = json.dumps({"term": term, "entity": entity, "limit": limit}, ensure_ascii=False)
        if key in self.cache:
            return self.cache[key]

        params = {
            "term": term,
            "entity": entity,
            "limit": str(limit),
            "country": "JP",
        }
        url = f"https://itunes.apple.com/search?{urlencode(params)}"

        last_error: Exception | None = None
        for attempt in range(5):
            try:
                request = Request(url, headers={"User-Agent": USER_AGENT})
                with urlopen(request, timeout=20) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                results = payload.get("results", [])
                self.cache[key] = results
                self.save()
                time.sleep(0.35)
                return results
            except Exception as error:  # noqa: BLE001
                last_error = error
                time.sleep(1.2 * (attempt + 1))

        raise RuntimeError(f"Apple search failed for {term} / {entity}: {last_error}")


@dataclass
class AlbumDef:
    id: str
    title: str
    kind: str
    order: int
    tracks: list[str]


def parse_uml(path: Path) -> tuple[list[AlbumDef], list[str], dict[str, str]]:
    text = path.read_text()
    lines = text.splitlines()

    albums: list[AlbumDef] = []
    singles: list[str] = []
    release_targets: dict[str, str] = {}

    current_album: AlbumDef | None = None
    album_order = 0

    for raw in lines:
        line = raw.strip()

        package_match = re.match(r'package "(.+?)\\n(.+?)" \{', line)
        if package_match:
            header = package_match.group(1)
            title = package_match.group(2).replace('\\"', '"')
            if "MINI" in header:
                kind = "mini"
            elif "TOUR" in header:
                kind = "tour"
            else:
                kind = "full"
            album_order += 1
            current_album = AlbumDef(
                id=f"album-{slugify(title)}",
                title=title,
                kind=kind,
                order=album_order,
                tracks=[],
            )
            albums.append(current_album)
            continue

        if line == "}":
            current_album = None
            continue

        class_match = re.match(r'class "(.+?)"', line)
        if class_match:
            name = class_match.group(1)
            if name.endswith("(S)"):
                singles.append(name[:-3])
            elif current_album is not None:
                current_album.tracks.append(name)
            continue

        edge_match = re.match(r'"(.+?)" --> "(.+?)"', line)
        if edge_match and edge_match.group(1).endswith("(S)"):
            release_targets[edge_match.group(1)[:-3]] = edge_match.group(2)

    return albums, singles, release_targets


def choose_album_result(results: list[dict[str, Any]], title: str) -> dict[str, Any]:
    filtered = [item for item in results if item.get("artistName") == ARTIST_NAME]
    if not filtered:
        raise RuntimeError(f"No album results for {title}")

    def score(item: dict[str, Any]) -> tuple[int, str]:
        name = item.get("collectionName", "")
        score_value = 0
        title_text = SEARCH_TITLE_OVERRIDES.get(title, title)
        if name == title_text:
            score_value += 6
        elif name.startswith(title_text):
            score_value += 5
        elif title_text in name:
            score_value += 4
        if item.get("primaryGenreName") in {"ロック", "J-Pop"}:
            score_value += 1
        return (score_value, item.get("releaseDate", "9999"))

    filtered.sort(key=score, reverse=True)
    return filtered[0]


def choose_single_result(
    title: str,
    album_results: list[dict[str, Any]],
    song_results: list[dict[str, Any]],
    fallback_album: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any], str]:
    artist_album_results = [item for item in album_results if item.get("artistName") == ARTIST_NAME]
    artist_song_results = [item for item in song_results if item.get("artistName") == ARTIST_NAME]

    def album_score(item: dict[str, Any]) -> tuple[int, str]:
        name = item.get("collectionName", "")
        score_value = 0
        title_text = SINGLE_SEARCH_OVERRIDES.get(title, title)
        collection_override = SINGLE_COLLECTION_OVERRIDES.get(title)
        title_match = (
            name == title_text
            or name.startswith(title_text)
            or title_text in name
            or (collection_override is not None and name == collection_override)
        )
        if name.endswith(" - Single"):
            score_value += 6 if title_match else 0
        elif name.endswith(" - EP"):
            score_value += 4 if title_match else 0
        if title_match:
            score_value += 2
        return (score_value, item.get("releaseDate", "9999"))

    preferred_albums = [item for item in artist_album_results if album_score(item)[0] >= 4]
    if preferred_albums:
        preferred_albums.sort(key=album_score, reverse=True)
        return preferred_albums[0], "album"

    exact_tracks = [item for item in artist_song_results if item.get("trackName") == title]
    if exact_tracks:
        def song_score(item: dict[str, Any]) -> tuple[int, str]:
            score_value = 0
            collection_name = item.get("collectionName", "")
            if collection_name.endswith(" - Single"):
                score_value += 4
            elif collection_name.endswith(" - EP"):
                score_value += 2
            return (score_value, item.get("releaseDate", "9999"))

        exact_tracks.sort(key=song_score, reverse=True)
        return exact_tracks[0], "song"

    fallback_title = SINGLE_ART_FALLBACK_ALBUMS.get(title)
    if fallback_title:
        return fallback_album[fallback_title], "album-fallback"

    raise LookupError(f"No single metadata for {title}")


def choose_track_result(title: str, song_results: list[dict[str, Any]]) -> dict[str, Any]:
    exact_tracks = [
        item
        for item in song_results
        if item.get("artistName") == ARTIST_NAME and item.get("trackName") == title
    ]
    if not exact_tracks:
        raise LookupError(f"No exact song metadata for {title}")

    def song_score(item: dict[str, Any]) -> tuple[int, str]:
        score_value = 0
        collection_name = item.get("collectionName", "")
        if collection_name.endswith(" - Single"):
            score_value += 4
        elif collection_name.endswith(" - EP"):
            score_value += 2
        return (score_value, item.get("releaseDate", "9999"))

    exact_tracks.sort(key=song_score, reverse=True)
    return exact_tracks[0]


def build_manual_album_metadata(
    title: str,
    album_def: AlbumDef,
    search: AppleSearch,
    albums_by_title: dict[str, dict[str, Any]],
    korean_titles: dict[str, str],
) -> dict[str, Any]:
    manual = MANUAL_ALBUM_METADATA[title]
    artwork_url = None
    artwork_source_title = manual.get("artworkSingleTitle")

    if artwork_source_title:
        album_results = search.search(f"{artwork_source_title} {ARTIST_NAME}", "album")
        song_results: list[dict[str, Any]] = []
        try:
            picked, _ = choose_single_result(
                artwork_source_title,
                album_results,
                song_results,
                albums_by_title,
            )
        except LookupError:
            song_results = search.search(f"{artwork_source_title} {ARTIST_NAME}", "song")
            picked, _ = choose_single_result(
                artwork_source_title,
                album_results,
                song_results,
                albums_by_title,
            )
        artwork_url = extract_artwork_url(picked)

    return {
        "id": album_def.id,
        "type": "album",
        "kind": album_def.kind,
        "title": album_def.title,
        "label": album_def.title,
        "releaseDate": manual["releaseDate"],
        "artworkUrl": artwork_url,
        "artworkPath": build_artwork_path("album", album_def.title),
        "collectionName": manual["collectionName"],
        "order": album_def.order,
        "trackTitles": album_def.tracks,
    }


def build_dataset() -> dict[str, Any]:
    albums_raw, single_titles, release_targets = parse_uml(UML_PATH)
    search = AppleSearch(CACHE_PATH)
    title_map_by_class = load_title_map()
    korean_titles = flatten_title_map(title_map_by_class)
    generated_at = datetime.now(timezone.utc).isoformat()

    albums_by_title: dict[str, dict[str, Any]] = {}
    for album_def in albums_raw:
        if album_def.title in MANUAL_ALBUM_METADATA:
            albums_by_title[album_def.title] = build_manual_album_metadata(
                album_def.title,
                album_def,
                search,
                albums_by_title,
                korean_titles,
            )
            continue

        query = f'{SEARCH_TITLE_OVERRIDES.get(album_def.title, album_def.title)} {ARTIST_NAME}'
        results = search.search(query, "album")
        picked = choose_album_result(results, album_def.title)
        albums_by_title[album_def.title] = {
            "id": album_def.id,
            "type": "album",
            "kind": album_def.kind,
            "title": album_def.title,
            "label": album_def.title,
            "releaseDate": iso_to_date(picked["releaseDate"]),
            "artworkUrl": extract_artwork_url(picked),
            "artworkPath": build_artwork_path("album", album_def.title),
            "collectionName": picked.get("collectionName"),
            "order": album_def.order,
            "trackTitles": album_def.tracks,
        }

    song_membership: dict[str, list[dict[str, Any]]] = {}
    canonical_labels: dict[str, str] = {}

    for album_def in albums_raw:
        album = albums_by_title[album_def.title]
        for index, track_title in enumerate(album_def.tracks):
            canonical = canonicalize_work_title(track_title)
            canonical_labels.setdefault(canonical, canonical)
            song_membership.setdefault(canonical, []).append(
                {
                    "albumId": album["id"],
                    "albumTitle": album["title"],
                    "displayTitle": track_title,
                    "order": index,
                    "kind": album["kind"],
                    "albumReleaseDate": album["releaseDate"],
                }
            )

    songs: list[dict[str, Any]] = []
    for canonical_title, memberships in song_membership.items():
        memberships.sort(key=lambda item: (item["albumReleaseDate"], item["order"]))
        first_membership = memberships[0]
        song_id = f"song-{slugify(canonical_title)}"
        songs.append(
            {
                "id": song_id,
                "type": "song",
                "title": canonical_title,
                "label": canonical_labels[canonical_title],
                "firstAlbumId": first_membership["albumId"],
                "firstAlbumTitle": first_membership["albumTitle"],
                "albumMembership": memberships,
                "releaseDate": first_membership["albumReleaseDate"],
                "singleIds": [],
            }
        )

    songs_by_title = {song["title"]: song for song in songs}

    singles: list[dict[str, Any]] = []
    for index, single_title in enumerate(single_titles):
        release_target = release_targets.get(single_title, single_title)
        target_title = canonicalize_work_title(release_target)
        album_results = search.search(f"{single_title} {ARTIST_NAME}", "album")
        song_results: list[dict[str, Any]] = []
        try:
            picked, source_kind = choose_single_result(
                single_title,
                album_results,
                song_results,
                albums_by_title,
            )
        except LookupError:
            song_results = search.search(f"{single_title} {ARTIST_NAME}", "song")
            picked, source_kind = choose_single_result(
                single_title,
                album_results,
                song_results,
                albums_by_title,
            )
        if source_kind == "album-fallback":
            try:
                song_results = search.search(f"{single_title} {ARTIST_NAME}", "song")
                track_pick = choose_track_result(single_title, song_results)
                picked = {**picked, "releaseDate": track_pick["releaseDate"]}
            except LookupError:
                pass

        if target_title not in songs_by_title:
            songs.append(
                {
                    "id": f"song-{slugify(target_title)}",
                    "type": "song",
                    "title": target_title,
                    "label": release_target,
                    "firstAlbumId": None,
                    "firstAlbumTitle": None,
                    "albumMembership": [],
                    "releaseDate": iso_to_date(picked["releaseDate"]),
                    "singleIds": [],
                }
            )
            songs_by_title[target_title] = songs[-1]

        single_id = f"single-{slugify(single_title)}"
        singles.append(
            {
                "id": single_id,
                "type": "single",
                "title": single_title,
                "label": single_title,
                "releaseDate": iso_to_date(picked["releaseDate"]),
                "artworkUrl": extract_artwork_url(picked),
                "artworkPath": build_artwork_path("single", single_title),
                "collectionName": picked.get("collectionName", ""),
                "metadataSource": source_kind,
                "targetSongId": songs_by_title[target_title]["id"],
                "order": index,
            }
        )
        songs_by_title[target_title]["singleIds"].append(single_id)
        song_date = songs_by_title[target_title]["releaseDate"]
        songs_by_title[target_title]["releaseDate"] = min(song_date, iso_to_date(picked["releaseDate"]))

    albums = list(albums_by_title.values())
    albums.sort(key=lambda item: item["releaseDate"])
    songs.sort(key=lambda item: (item["releaseDate"], item["title"]))
    singles.sort(key=lambda item: (item["releaseDate"], item["order"]))

    edges: list[dict[str, str]] = []
    for single in singles:
        edges.append(
            {
                "id": f"edge-{single['id']}-to-{single['targetSongId']}",
                "source": single["id"],
                "target": single["targetSongId"],
                "type": "release",
            }
        )

    for song in songs:
        for membership in song["albumMembership"]:
            edges.append(
                {
                    "id": f"edge-{song['id']}-to-{membership['albumId']}",
                    "source": song["id"],
                    "target": membership["albumId"],
                    "type": "included",
                }
            )

    dataset = {
        "meta": {
            "artist": "ZUTOMAYO",
            "artistJa": ARTIST_NAME,
            "title": "ZUTOMAYO Discography Graph",
            "generatedAt": generated_at,
            "sourceFiles": [str(UML_PATH.relative_to(ROOT)), str(TITLE_MAP_PATH.relative_to(ROOT))],
            "metadataSource": "Apple Music / iTunes Search API + manual Blu-ray / Live session lists",
        },
        "titleMap": title_map_by_class,
        "albums": albums,
        "songs": songs,
        "singles": singles,
        "edges": edges,
    }

    return dataset


def main() -> None:
    dataset = build_dataset()
    payload = json.dumps(
        dataset,
        ensure_ascii=False,
        indent=2,
    ) + "\n"
    GRAPH_PATH.write_text(payload)
    print(f"Wrote {GRAPH_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
