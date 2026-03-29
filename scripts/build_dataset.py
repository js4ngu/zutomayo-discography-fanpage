#!/usr/bin/env python3

from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
GRAPH_PATH = ROOT / "data" / "graph.json"
TITLE_MAP_PATH = ROOT / "data" / "title-map.json"
SINGLE_PATH = ROOT / "data" / "single.json"
MINI_PATH = ROOT / "data" / "mini.json"
FULL_ALBUM_PATH = ROOT / "data" / "full-album.json"
LIVE_PATH = ROOT / "data" / "live.json"

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

LIVE_SUFFIX_PATTERNS = [
    re.compile(r" \((?:Live|Live in Studio_.+?)\)$"),
    re.compile(r" \(.+? / LIVE\)$"),
    re.compile(r" \[.+? / LIVE\]$"),
    re.compile(r" \[Live\]$"),
]


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).lower()
    normalized = re.sub(r"[^\w]+", "-", normalized, flags=re.UNICODE)
    normalized = normalized.strip("-")
    return normalized or "item"


def canonicalize_work_title(value: str) -> str:
    title = value.strip()
    if title in WORK_ALIASES:
        return WORK_ALIASES[title]

    normalized = title
    for pattern in LIVE_SUFFIX_PATTERNS:
        normalized = pattern.sub("", normalized)

    return WORK_ALIASES.get(normalized, normalized)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def with_optional_artwork_url(item: dict[str, Any], artwork_url: str | None) -> dict[str, Any]:
    if artwork_url:
        item["artworkUrl"] = artwork_url
    return item


def load_source_data() -> tuple[dict[str, dict[str, str]], list[dict[str, Any]], list[dict[str, Any]]]:
    title_map = load_json(TITLE_MAP_PATH)
    album_sections = [
        ("mini", load_json(MINI_PATH)["items"]),
        ("full", load_json(FULL_ALBUM_PATH)["items"]),
        ("tour", load_json(LIVE_PATH)["items"]),
    ]

    albums: list[dict[str, Any]] = []
    order = 0
    for kind, items in album_sections:
        for item in items:
            order += 1
            albums.append(
                with_optional_artwork_url({
                    "id": f"album-{slugify(item['title'])}",
                    "type": "album",
                    "kind": kind,
                    "title": item["title"],
                    "label": item["title"],
                    "releaseDate": item["releaseDate"],
                    "artworkPath": item["artworkPath"],
                    "collectionName": item.get("collectionName", ""),
                    "order": order,
                    "trackTitles": item["trackTitles"],
                }, item.get("artworkUrl"))
            )

    singles_source = load_json(SINGLE_PATH)["items"]
    return title_map, albums, singles_source


def build_dataset() -> dict[str, Any]:
    title_map_by_class, albums, singles_source = load_source_data()
    generated_at = datetime.now(timezone.utc).isoformat()

    albums.sort(key=lambda item: (item["releaseDate"], item["order"]))
    albums_by_title = {album["title"]: album for album in albums}

    song_membership: dict[str, list[dict[str, Any]]] = {}
    canonical_labels: dict[str, str] = {}

    for album in albums:
        for order, track_title in enumerate(album["trackTitles"]):
            canonical = canonicalize_work_title(track_title)
            canonical_labels.setdefault(canonical, canonical)
            song_membership.setdefault(canonical, []).append(
                {
                    "albumId": album["id"],
                    "albumTitle": album["title"],
                    "displayTitle": track_title,
                    "order": order,
                    "kind": album["kind"],
                    "albumReleaseDate": album["releaseDate"],
                }
            )

    songs: list[dict[str, Any]] = []
    for canonical_title, memberships in song_membership.items():
        memberships.sort(key=lambda item: (item["albumReleaseDate"], item["order"]))
        first_membership = memberships[0]
        songs.append(
            {
                "id": f"song-{slugify(canonical_title)}",
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
    for order, item in enumerate(singles_source):
        target_title = canonicalize_work_title(item["targetTitle"])
        if target_title not in songs_by_title:
            songs_by_title[target_title] = {
                "id": f"song-{slugify(target_title)}",
                "type": "song",
                "title": target_title,
                "label": item["targetTitle"],
                "firstAlbumId": None,
                "firstAlbumTitle": None,
                "albumMembership": [],
                "releaseDate": item["releaseDate"],
                "singleIds": [],
            }
            songs.append(songs_by_title[target_title])

        single_id = f"single-{slugify(item['title'])}"
        singles.append(
            with_optional_artwork_url({
                "id": single_id,
                "type": "single",
                "title": item["title"],
                "label": item["title"],
                "releaseDate": item["releaseDate"],
                "artworkPath": item["artworkPath"],
                "collectionName": item.get("collectionName", ""),
                "metadataSource": item.get("metadataSource", "source-json"),
                "targetSongId": songs_by_title[target_title]["id"],
                "order": order,
            }, item.get("artworkUrl"))
        )
        songs_by_title[target_title]["singleIds"].append(single_id)
        songs_by_title[target_title]["releaseDate"] = min(
            songs_by_title[target_title]["releaseDate"],
            item["releaseDate"],
        )

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

    return {
        "meta": {
            "artist": "ZUTOMAYO",
            "artistJa": "ずっと真夜中でいいのに。",
            "title": "ZUTOMAYO Discography Graph",
            "generatedAt": generated_at,
            "sourceFiles": [
                str(SINGLE_PATH.relative_to(ROOT)),
                str(MINI_PATH.relative_to(ROOT)),
                str(FULL_ALBUM_PATH.relative_to(ROOT)),
                str(LIVE_PATH.relative_to(ROOT)),
                str(TITLE_MAP_PATH.relative_to(ROOT)),
            ],
            "metadataSource": "Managed source JSON files",
        },
        "titleMap": title_map_by_class,
        "albums": albums,
        "songs": songs,
        "singles": singles,
        "edges": edges,
    }


def main() -> None:
    dataset = build_dataset()
    GRAPH_PATH.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n")
    print(f"Wrote {GRAPH_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
