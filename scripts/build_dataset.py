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
WORK_ALIASES_PATH = ROOT / "data" / "work-aliases.json"
SINGLE_PATH = ROOT / "data" / "single.json"
MINI_PATH = ROOT / "data" / "mini.json"
FULL_ALBUM_PATH = ROOT / "data" / "full-album.json"
LIVE_PATH = ROOT / "data" / "live.json"

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


def canonicalize_work_title(value: str, work_aliases: dict[str, str]) -> str:
    title = value.strip()
    if title in work_aliases:
        return work_aliases[title]

    normalized = title
    for pattern in LIVE_SUFFIX_PATTERNS:
        normalized = pattern.sub("", normalized)

    return work_aliases.get(normalized, normalized)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def with_optional_artwork_url(item: dict[str, Any], artwork_url: str | None) -> dict[str, Any]:
    if artwork_url:
        item["artworkUrl"] = artwork_url
    return item


def with_optional_string(item: dict[str, Any], key: str, value: str | None) -> dict[str, Any]:
    if value:
        item[key] = value
    return item


def load_source_data() -> tuple[dict[str, dict[str, str]], dict[str, str], list[dict[str, Any]], list[dict[str, Any]]]:
    title_map = load_json(TITLE_MAP_PATH)
    work_aliases = load_json(WORK_ALIASES_PATH)
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
            album = with_optional_artwork_url({
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
            albums.append(with_optional_string(album, "youtubeUrl", item.get("youtubeUrl")))

    singles_source = load_json(SINGLE_PATH)["items"]
    return title_map, work_aliases, albums, singles_source


def build_dataset() -> dict[str, Any]:
    title_map_by_class, work_aliases, albums, singles_source = load_source_data()
    generated_at = datetime.now(timezone.utc).isoformat()

    albums.sort(key=lambda item: (item["releaseDate"], item["order"]))
    albums_by_title = {album["title"]: album for album in albums}

    song_membership: dict[str, list[dict[str, Any]]] = {}
    canonical_labels: dict[str, str] = {}

    for album in albums:
        for order, track_title in enumerate(album["trackTitles"]):
            canonical = canonicalize_work_title(track_title, work_aliases)
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
        target_title = canonicalize_work_title(item["targetTitle"], work_aliases)
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
        single = with_optional_artwork_url({
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
        singles.append(with_optional_string(single, "youtubeUrl", item.get("youtubeUrl")))
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
                str(WORK_ALIASES_PATH.relative_to(ROOT)),
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
