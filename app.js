(async () => {
const data = await fetchGraphData();

const svg = d3.select("#graph");
const stage = document.querySelector(".graph-stage");
const infoFooter = document.querySelector(".info-footer");
const tooltip = document.getElementById("tooltip");
const closeFocusDrawerButton = document.getElementById("closeFocusDrawerButton");
const detailTitle = document.getElementById("detailTitle");
const detailSubtitle = document.getElementById("detailSubtitle");
const detailArtwork = document.getElementById("detailArtwork");
const detailList = document.getElementById("detailList");
const detailLinks = document.getElementById("detailLinks");
const filterInputs = document.querySelectorAll("[data-filter-kind]");
const supportsHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
const trackAnalyticsEvent =
  typeof window.trackAnalyticsEvent === "function" ? window.trackAnalyticsEvent : () => {};

const SINGLE_DOUBLE_TAP_MS = 420;
const WIDTH = 2420;
const VIEW_MARGIN = { top: 150, right: 72, bottom: 110, left: 72 };
const LANE_ORDER = ["single", "mini", "full", "tour"];
const LANE_LABELS = {
  single: "Single",
  mini: "Mini Album",
  full: "Full Album",
  tour: "Blu-ray / Live",
};
const ALBUM_KIND_LABELS = {
  mini: "MINI ALBUM",
  full: "FULL ALBUM",
  tour: "LIVE SESSION",
};
const ALBUM_KIND_DETAIL_LABELS = {
  mini: "mini album",
  full: "full album",
  tour: "live session",
};
const KOREAN_TITLE_ALIASES = new Map(
  Object.entries({
    ...(data.titleMap?.song ?? {}),
    ...(data.titleMap?.mini ?? {}),
    ...(data.titleMap?.full ?? {}),
    ...(data.titleMap?.live ?? {}),
  }),
);
const LANE_GAP = 44;
const LANE_FIT_PADDING = 12;
const ALBUM_TRACK_START_Y = 156;

const parsedAlbums = data.albums.map((album) => ({
  ...album,
  parsedDate: new Date(`${album.releaseDate}T00:00:00+09:00`),
}));

const parsedSongs = data.songs.map((song) => ({
  ...song,
  parsedDate: new Date(`${song.releaseDate}T00:00:00+09:00`),
}));

const parsedSingles = data.singles.map((single) => ({
  ...single,
  parsedDate: new Date(`${single.releaseDate}T00:00:00+09:00`),
}));

const albumById = new Map(parsedAlbums.map((album) => [album.id, album]));
const songById = new Map(parsedSongs.map((song) => [song.id, song]));
const singleById = new Map(parsedSingles.map((single) => [single.id, single]));
const firstTourAlbum = parsedAlbums.find((album) => album.kind === "tour") ?? null;
const songIdByMembershipKey = new Map();

for (const song of parsedSongs) {
  for (const membership of song.albumMembership) {
    songIdByMembershipKey.set(`${membership.albumId}::${membership.order}`, song.id);
  }
}

const minDate = d3.min(
  [...parsedAlbums, ...parsedSongs, ...parsedSingles],
  (item) => item.parsedDate,
);
const maxDate = d3.max(
  [...parsedAlbums, ...parsedSongs, ...parsedSingles],
  (item) => item.parsedDate,
);

const domainStart = d3.timeMonth.offset(minDate, -3);
const domainEnd = d3.timeMonth.offset(maxDate, 3);
const spanYears = Math.max(7, d3.timeYear.count(domainStart, domainEnd) + 1);
const BASE_HEIGHT = Math.max(3400, spanYears * 420 + 520);

function createYScale(height) {
  return d3
    .scaleTime()
    .domain([domainStart, domainEnd])
    .range([VIEW_MARGIN.top, height - VIEW_MARGIN.bottom]);
}

let graphHeight = BASE_HEIGHT;
let yScale = createYScale(graphHeight);

const yearTicks = d3.timeYear.every(1).range(
  d3.timeYear.floor(domainStart),
  d3.timeYear.offset(d3.timeYear.ceil(domainEnd), 1),
);

const state = {
  activeId: null,
  activeContext: null,
  hoverNodeId: null,
  lastSingleTap: null,
  filters: {
    single: true,
    mini: true,
    full: true,
    tour: false,
  },
};

let graph = null;
let viewport = null;
let edgeSelection = null;
let albumSelection = null;
let trackGroupSelection = null;
let singleSelection = null;
let defsLayer = null;
let backgroundLayer = null;
let edgeLayer = null;
let albumLayer = null;
let singleLayer = null;

const graphCache = new Map();

const fallbackArtworkCache = new Map();
const singleLabelMeasureCanvas = document.createElement("canvas");
const singleLabelMeasureContext = singleLabelMeasureCanvas.getContext("2d");
if (singleLabelMeasureContext) {
  singleLabelMeasureContext.font = '700 14px "Zen Kaku Gothic New", sans-serif';
}

function getFallbackArtworkUrl(label = "ZTMY") {
  const key = (label || "ZTMY").slice(0, 24);
  if (fallbackArtworkCache.has(key)) {
    return fallbackArtworkCache.get(key);
  }

  const safeLabel = String(key)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  const fallbackSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'>
  <defs>
    <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='#52e7ff'/>
      <stop offset='48%' stop-color='#8f47de'/>
      <stop offset='100%' stop-color='#ff6ddf'/>
    </linearGradient>
  </defs>
  <rect width='300' height='300' fill='#120726'/>
  <rect x='18' y='18' width='264' height='264' rx='36' fill='url(#g)' opacity='0.34'/>
  <circle cx='150' cy='150' r='72' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='2'/>
  <text x='150' y='164' text-anchor='middle' fill='#f7efff' font-family='Arial, sans-serif' font-size='28' font-weight='700'>${safeLabel}</text>
</svg>`;

  const url = `data:image/svg+xml;utf8,${encodeURIComponent(fallbackSvg)}`;
  fallbackArtworkCache.set(key, url);
  return url;
}

function resolveArtworkUrl(item, fallbackLabel = "ZTMY") {
  if (item?.artworkPath) {
    return item.artworkPath;
  }
  if (item?.artworkUrl) {
    return item.artworkUrl;
  }
  return getFallbackArtworkUrl(fallbackLabel);
}

function resolveSingleArtworkUrl(single) {
  if (single.artworkPath || single.artworkUrl) {
    return resolveArtworkUrl(single, single.title?.slice(0, 6) || "ZTMY");
  }

  const song = songById.get(single.targetSongId);
  const firstAlbumId = song?.firstAlbumId ?? song?.albumMembership?.[0]?.albumId;
  const firstAlbumArtwork = firstAlbumId ? resolveArtworkUrl(albumById.get(firstAlbumId)) : null;
  if (firstAlbumArtwork) {
    return firstAlbumArtwork;
  }

  return getFallbackArtworkUrl(single.title?.slice(0, 6) || "ZTMY");
}

const singleArtworkById = new Map(parsedSingles.map((single) => [single.id, resolveSingleArtworkUrl(single)]));

function isWideChar(char) {
  return char.charCodeAt(0) > 255;
}

function wrapLabel(text, maxUnits) {
  const lines = [];
  let current = "";
  let units = 0;

  for (const char of text) {
    const weight = isWideChar(char) ? 1 : 0.55;
    if (units + weight > maxUnits && current) {
      lines.push(current.trim());
      current = "";
      units = 0;
    }
    current += char;
    units += weight;
  }

  if (current) {
    lines.push(current.trim());
  }

  return lines.slice(0, 3);
}

function truncateLabelByPixel(text, maxWidth) {
  if (!singleLabelMeasureContext || singleLabelMeasureContext.measureText(text).width <= maxWidth) {
    return text;
  }

  const ellipsis = "…";
  const ellipsisWidth = singleLabelMeasureContext.measureText(ellipsis).width;
  let output = "";

  for (const char of text) {
    const candidate = `${output}${char}`;
    const candidateWidth = singleLabelMeasureContext.measureText(candidate).width;
    if (candidateWidth + ellipsisWidth > maxWidth) {
      return `${output.trimEnd()}${ellipsis}`;
    }
    output = candidate;
  }

  return output;
}

function packNodes(items, minGap, minY, maxY) {
  if (!items.length) {
    return;
  }

  const sorted = [...items].sort((a, b) => (a.baseY - b.baseY) || (a.order - b.order));
  let cursor = minY;

  for (const item of sorted) {
    item.y = Math.max(item.baseY, cursor);
    cursor = item.y + minGap;
  }

  const overflow = cursor - minGap - maxY;
  if (overflow > 0) {
    let backCursor = maxY;
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const item = sorted[index];
      item.y = Math.min(item.y, backCursor);
      backCursor = item.y - minGap;
    }

    cursor = minY;
    for (const item of sorted) {
      if (item.y < cursor) {
        item.y = cursor;
      }
      cursor = item.y + minGap;
    }
  }
}

function packAlbums(albums, minGap, minY, maxY = Number.POSITIVE_INFINITY) {
  if (!albums.length) {
    return;
  }

  const sorted = [...albums].sort((a, b) => (a.baseCenterY - b.baseCenterY) || (a.order - b.order));
  let cursor = minY;

  for (const album of sorted) {
    const targetTop = album.baseCenterY - album.height / 2;
    album.y = Math.max(targetTop, cursor);
    cursor = album.y + album.height + minGap;
  }

  const occupiedBottom = cursor - minGap;
  if (occupiedBottom > maxY) {
    let backCursor = maxY;
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const album = sorted[index];
      album.y = Math.min(album.y, backCursor - album.height);
      backCursor = album.y - minGap;
    }

    cursor = minY;
    for (const album of sorted) {
      if (album.y < cursor) {
        album.y = cursor;
      }
      cursor = album.y + album.height + minGap;
    }
  }
}

function getActiveLaneKeys() {
  return LANE_ORDER.filter((key) => state.filters[key]);
}

function buildLanePanels(activeLaneKeys) {
  const activeCount = activeLaneKeys.length;
  const usableWidth = WIDTH - VIEW_MARGIN.left - VIEW_MARGIN.right - LANE_GAP * (activeCount - 1);
  const laneWidth = usableWidth / activeCount;
  const panels = {};

  activeLaneKeys.forEach((key, index) => {
    const x = VIEW_MARGIN.left + index * (laneWidth + LANE_GAP);
    panels[key] = {
      x,
      width: laneWidth,
      labelX: x + laneWidth / 2,
    };
  });

  const visiblePanels = activeLaneKeys.map((key) => panels[key]);
  const fitViewBoxLeft = Math.max(0, visiblePanels[0].x - LANE_FIT_PADDING);
  const fitViewBoxRight = Math.min(WIDTH, visiblePanels.at(-1).x + visiblePanels.at(-1).width + LANE_FIT_PADDING);

  return {
    panels,
    fitViewBoxLeft,
    fitViewBoxRight,
    fitViewBoxWidth: fitViewBoxRight - fitViewBoxLeft,
  };
}

function getAlbumCardHeight(album, laneWidth) {
  const titleMaxUnits = Math.max(
    album.kind === "tour" ? 11.5 : 13.5,
    Math.floor((laneWidth - 48) / 18),
  );
  const titleLines = wrapLabel(album.title, titleMaxUnits);
  const trackMaxUnits = Math.max(
    album.kind === "tour" ? 18 : 20,
    Math.floor((laneWidth - 48) / 16.5),
  );
  const wrappedTracks = album.trackTitles.map((title, order) => {
    const lines = wrapLabel(title, trackMaxUnits);
    const blockHeight = lines.length * 18 + 12;
    return { title, order, lines, blockHeight };
  });

  let cursorY = ALBUM_TRACK_START_Y;
  wrappedTracks.forEach((track) => {
    track.offsetY = cursorY;
    cursorY += track.blockHeight;
  });

  return {
    titleLines,
    wrappedTracks,
    cardHeight: cursorY + 26,
  };
}

function getRequiredGraphHeight(activeLaneKeys, visibleAlbums, laneData, singleCard) {
  let requiredHeight = BASE_HEIGHT;

  if (state.filters.single && singleCard) {
    const singlesHeight =
      VIEW_MARGIN.top + 30 + Math.max(0, (parsedSingles.length - 1) * 98) + VIEW_MARGIN.bottom + 24 + singleCard.height / 2;
    requiredHeight = Math.max(requiredHeight, singlesHeight);
  }

  const albumGapByKind = {
    mini: 96,
    full: 104,
    tour: 116,
  };

  for (const kind of ["mini", "full", "tour"]) {
    if (!laneData.panels[kind]) {
      continue;
    }

    const laneAlbums = visibleAlbums.filter((album) => album.kind === kind);
    if (!laneAlbums.length) {
      continue;
    }

    const laneWidth = laneData.panels[kind].width - 48;
    const laneHeights = laneAlbums.map((album) => getAlbumCardHeight(album, laneWidth).cardHeight);
    const requiredLaneHeight =
      VIEW_MARGIN.top +
      22 +
      laneHeights.reduce((sum, height) => sum + height, 0) +
      Math.max(0, laneHeights.length - 1) * albumGapByKind[kind] +
      VIEW_MARGIN.bottom +
      24;

    requiredHeight = Math.max(requiredHeight, requiredLaneHeight);
  }

  return requiredHeight;
}

function buildGraphData() {
  const activeLaneKeys = getActiveLaneKeys();
  const laneData = buildLanePanels(activeLaneKeys);
  const visibleAlbums = parsedAlbums.filter((album) => state.filters[album.kind]);
  const albumLayouts = new Map();
  const albumGapByKind = {
    mini: 96,
    full: 104,
    tour: 116,
  };

  const singleCard = state.filters.single
    ? {
        width: laneData.panels.single.width - 48,
        height: 82,
        x: laneData.panels.single.x + 24,
      }
    : null;

  const height = getRequiredGraphHeight(activeLaneKeys, visibleAlbums, laneData, singleCard);
  const layoutYScale = createYScale(height);
  const singleTitleMaxWidth = singleCard ? singleCard.width - 108 : 0;
  const albumCardByKind = {};

  for (const kind of ["mini", "full", "tour"]) {
    if (!laneData.panels[kind]) {
      continue;
    }
    albumCardByKind[kind] = {
      width: laneData.panels[kind].width - 48,
      x: laneData.panels[kind].x + 24,
    };
  }

  for (const album of visibleAlbums) {
    const card = albumCardByKind[album.kind];
    const { titleLines, wrappedTracks, cardHeight } = getAlbumCardHeight(album, card.width);
    const centerY = layoutYScale(album.parsedDate);
    albumLayouts.set(album.id, {
      ...album,
      x: card.x,
      width: card.width,
      height: cardHeight,
      baseCenterY: centerY,
      y: centerY - cardHeight / 2,
      titleLines,
      rawTracks: wrappedTracks,
      trackLayouts: [],
    });
  }

  const albumNodes = Array.from(albumLayouts.values());
  for (const kind of ["mini", "full", "tour"]) {
    packAlbums(
      albumNodes.filter((album) => album.kind === kind),
      albumGapByKind[kind],
      VIEW_MARGIN.top + 22,
      height - VIEW_MARGIN.bottom - 24,
    );
  }

  for (const album of albumNodes) {
    album.trackLayouts = album.rawTracks.map((track) => ({
      ...track,
      key: `${album.id}::${track.order}`,
      x: album.x + 24,
      y: album.y + track.offsetY,
      width: album.width - 48,
    }));
  }

  const visibleAlbumIds = new Set(albumNodes.map((album) => album.id));
  const visibleMembershipsBySong = new Map(
    parsedSongs.map((song) => [
      song.id,
      song.albumMembership.filter((membership) => visibleAlbumIds.has(membership.albumId)),
    ]),
  );

  const singleNodes = state.filters.single
    ? parsedSingles.map((single, order) => ({
        ...single,
        order,
        x: singleCard.x,
        width: singleCard.width,
        height: singleCard.height,
        artworkUrl: singleArtworkById.get(single.id),
        shortLabel: truncateLabelByPixel(single.title, singleTitleMaxWidth),
        baseY: layoutYScale(single.parsedDate),
        y: layoutYScale(single.parsedDate),
      }))
    : [];

  if (state.filters.single) {
    packNodes(singleNodes, 98, VIEW_MARGIN.top + 30, height - VIEW_MARGIN.bottom - 24);
  }

  const membershipAnchorByKey = new Map();
  for (const song of parsedSongs) {
    for (const membership of visibleMembershipsBySong.get(song.id) ?? []) {
      const album = albumLayouts.get(membership.albumId);
      const anchor = album?.trackLayouts.find((track) => track.order === membership.order);
      if (!anchor) {
        continue;
      }

      membershipAnchorByKey.set(`${song.id}::${membership.albumId}`, {
        x: anchor.x,
        y: anchor.y + 12,
        trackKey: anchor.key,
        albumId: membership.albumId,
        songId: song.id,
        displayTitle: membership.displayTitle,
      });
    }
  }

  const edgeData = [];
  const edgeIdsBySong = new Map(parsedSongs.map((song) => [song.id, []]));
  const singleNodeBySongId = new Map();

  if (state.filters.single) {
    for (const single of singleNodes) {
      if (!singleNodeBySongId.has(single.targetSongId)) {
        singleNodeBySongId.set(single.targetSongId, single);
      }
    }
  }

  if (state.filters.single) {
    for (const single of singleNodes) {
      const song = songById.get(single.targetSongId);
      const visibleMemberships = visibleMembershipsBySong.get(song.id) ?? [];
      const studioMemberships = visibleMemberships.filter((membership) => membership.kind !== "tour");
      const liveMemberships = visibleMemberships.filter((membership) => membership.kind === "tour");
      const firstMembership = studioMemberships[0] ?? (liveMemberships.length === 0 ? visibleMemberships[0] : null);
      if (!firstMembership) {
        continue;
      }

      const firstAnchor = membershipAnchorByKey.get(`${song.id}::${firstMembership.albumId}`);
      if (!firstAnchor) {
        continue;
      }

      const edge = {
        id: `edge-release-${single.id}-${song.id}`,
        type: "release",
        songId: song.id,
        singleId: single.id,
        albumIdFrom: null,
        albumIdTo: firstMembership.albumId,
        points: {
          x1: single.x + single.width,
          y1: single.y,
          x2: firstAnchor.x,
          y2: firstAnchor.y,
        },
      };
      edgeData.push(edge);
      edgeIdsBySong.get(song.id)?.push(edge.id);
    }
  }

  const songIdsByAlbumId = new Map(albumNodes.map((album) => [album.id, []]));
  for (const song of parsedSongs) {
    const visibleMemberships = visibleMembershipsBySong.get(song.id) ?? [];
    visibleMemberships.forEach((membership) => {
      songIdsByAlbumId.get(membership.albumId)?.push(song.id);
    });
    if (visibleMemberships.length < 2) {
      continue;
    }

    const studioMemberships = visibleMemberships.filter((membership) => membership.kind !== "tour");
    const liveMemberships = visibleMemberships.filter((membership) => membership.kind === "tour");

    if (studioMemberships.length >= 2) {
      const firstStudioMembership = studioMemberships[0];
      const firstStudioAnchor = membershipAnchorByKey.get(`${song.id}::${firstStudioMembership.albumId}`);
      if (firstStudioAnchor) {
        studioMemberships.slice(1).forEach((membership) => {
          const anchor = membershipAnchorByKey.get(`${song.id}::${membership.albumId}`);
          if (!anchor) {
            return;
          }

          const edge = {
            id: `edge-included-${song.id}-${membership.albumId}`,
            type: "included",
            songId: song.id,
            singleId: null,
            albumIdFrom: firstStudioMembership.albumId,
            albumIdTo: membership.albumId,
            points: {
              x1: firstStudioAnchor.x + 24,
              y1: firstStudioAnchor.y,
              x2: anchor.x,
              y2: anchor.y,
            },
          };
          edgeData.push(edge);
          edgeIdsBySong.get(song.id)?.push(edge.id);
        });
      }
    }

    if (liveMemberships.length === 0) {
      continue;
    }

    const preferredStudioMembership =
      studioMemberships.find((membership) => membership.kind === "full") ??
      studioMemberships.find((membership) => membership.kind === "mini") ??
      null;

    const preferredStudioAnchor = preferredStudioMembership
      ? membershipAnchorByKey.get(`${song.id}::${preferredStudioMembership.albumId}`)
      : null;
    const sourceSingle = singleNodeBySongId.get(song.id) ?? null;

    liveMemberships.forEach((membership) => {
      const liveAnchor = membershipAnchorByKey.get(`${song.id}::${membership.albumId}`);
      if (!liveAnchor) {
        return;
      }

      if (preferredStudioMembership && preferredStudioAnchor) {
        const edge = {
          id: `edge-live-${song.id}-${preferredStudioMembership.albumId}-${membership.albumId}`,
          type: "included",
          songId: song.id,
          singleId: null,
          albumIdFrom: preferredStudioMembership.albumId,
          albumIdTo: membership.albumId,
          points: {
            x1: preferredStudioAnchor.x + 24,
            y1: preferredStudioAnchor.y,
            x2: liveAnchor.x,
            y2: liveAnchor.y,
          },
        };
        edgeData.push(edge);
        edgeIdsBySong.get(song.id)?.push(edge.id);
        return;
      }

      if (sourceSingle) {
        const edge = {
          id: `edge-live-single-${sourceSingle.id}-${membership.albumId}`,
          type: "release",
          songId: song.id,
          singleId: sourceSingle.id,
          albumIdFrom: null,
          albumIdTo: membership.albumId,
          points: {
            x1: sourceSingle.x + sourceSingle.width,
            y1: sourceSingle.y,
            x2: liveAnchor.x,
            y2: liveAnchor.y,
          },
        };
        edgeData.push(edge);
        edgeIdsBySong.get(song.id)?.push(edge.id);
      }
    });
  }

  return {
    height,
    activeLaneKeys,
    lanePanels: laneData.panels,
    fitViewBoxLeft: laneData.fitViewBoxLeft,
    fitViewBoxRight: laneData.fitViewBoxRight,
    fitViewBoxWidth: laneData.fitViewBoxWidth,
    singleCard,
    albumLayouts,
    albumNodes,
    singleNodes,
    edgeData,
    edgeIdsBySong,
    visibleAlbumIds,
    visibleMembershipsBySong,
    songIdsByAlbumId,
  };
}

function edgePath(edge) {
  const { x1, y1, x2, y2 } = edge.points;
  const mid = x1 + (x2 - x1) * 0.44;
  return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getNodeAnalyticsType(nodeId) {
  if (singleById.has(nodeId)) {
    return "single";
  }
  if (songById.has(nodeId)) {
    return "song";
  }
  if (albumById.has(nodeId)) {
    return albumById.get(nodeId).kind;
  }
  return "unknown";
}

function albumTooltip(album) {
  return `<strong>${htmlEscape(album.title)}</strong>${ALBUM_KIND_DETAIL_LABELS[album.kind]}<br>${album.releaseDate}<br>${album.trackTitles.length} tracks`;
}

function songTooltip(song, displayTitle = null) {
  const name = displayTitle ?? song.title;
  return `<strong>${htmlEscape(name)}</strong>first release ${song.releaseDate}<br>${song.albumMembership.length} album link(s)`;
}

function singleTooltip(single) {
  return `<strong>${htmlEscape(single.title)}</strong>${single.releaseDate}<br>${htmlEscape(single.collectionName)}`;
}

function moveTooltip(event) {
  if (!supportsHover) {
    return;
  }

  const rect = stage.getBoundingClientRect();
  const x = Math.min(event.clientX - rect.left + 18, rect.width - tooltip.offsetWidth - 14);
  const y = Math.min(event.clientY - rect.top + 18, rect.height - tooltip.offsetHeight - 14);
  tooltip.style.left = `${Math.max(14, x)}px`;
  tooltip.style.top = `${Math.max(14, y)}px`;
}

function showTooltip(event, html) {
  if (!supportsHover) {
    return;
  }

  tooltip.hidden = false;
  tooltip.innerHTML = html;
  moveTooltip(event);
}

function hideTooltip() {
  if (!supportsHover) {
    return;
  }

  tooltip.hidden = true;
}

function getVisibleMemberships(songId) {
  return graph?.visibleMembershipsBySong.get(songId) ?? [];
}

function getRelations(nodeId) {
  if (!nodeId || !graph) {
    return { nodeIds: new Set(), edgeIds: new Set(), trackKeys: new Set() };
  }

  if (singleById.has(nodeId)) {
    const single = singleById.get(nodeId);
    const song = songById.get(single.targetSongId);
    const memberships = getVisibleMemberships(song.id);
    return {
      nodeIds: new Set([single.id, song.id, ...memberships.map((membership) => membership.albumId)]),
      edgeIds: new Set(graph.edgeIdsBySong.get(song.id) ?? []),
      trackKeys: new Set(memberships.map((membership) => `${membership.albumId}::${membership.order}`)),
    };
  }

  if (songById.has(nodeId)) {
    const song = songById.get(nodeId);
    const memberships = getVisibleMemberships(song.id);
    return {
      nodeIds: new Set([
        song.id,
        ...(state.filters.single ? song.singleIds : []),
        ...memberships.map((membership) => membership.albumId),
      ]),
      edgeIds: new Set(graph.edgeIdsBySong.get(song.id) ?? []),
      trackKeys: new Set(memberships.map((membership) => `${membership.albumId}::${membership.order}`)),
    };
  }

  const album = albumById.get(nodeId);
  const songIds = graph.songIdsByAlbumId.get(album.id) ?? [];
  const songs = songIds.map((songId) => songById.get(songId));
  return {
    nodeIds: new Set([
      album.id,
      ...songs.map((song) => song.id),
      ...(state.filters.single ? songs.flatMap((song) => song.singleIds) : []),
      ...songs.flatMap((song) =>
        (graph.visibleMembershipsBySong.get(song.id) ?? []).map((membership) => membership.albumId),
      ),
    ]),
    edgeIds: new Set(
      graph.edgeData.filter((edge) => songs.some((song) => song.id === edge.songId)).map((edge) => edge.id),
    ),
    trackKeys: new Set(
      songs.flatMap((song) =>
        (graph.visibleMembershipsBySong.get(song.id) ?? []).map(
          (membership) => `${membership.albumId}::${membership.order}`,
        ),
      ),
    ),
  };
}

function detailRow(label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.innerHTML = value;
  return [dt, dd];
}

function getKoreanTitle(title) {
  if (!title) {
    return null;
  }

  const alias = KOREAN_TITLE_ALIASES.get(title) ?? null;
  return alias && alias !== title ? alias : null;
}

function setDetailSubtitle(value) {
  const text = value ?? "";
  detailSubtitle.textContent = text;
  detailSubtitle.hidden = !text;
}

function buildHeadingSubtitle(...lines) {
  return lines
    .map((line) => (line ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

function renderDefaultDetail() {
  detailTitle.textContent = data.meta.title;
  setDetailSubtitle("Blu-ray / Live는 기본으로 꺼져 있습니다. 필터를 켜고 끄면 숨겨진 레인은 제거되고, 남은 디스코그래피가 다시 폭을 맞춰 배치됩니다.");
  detailArtwork.className = "detail-artwork detail-artwork-empty";
  detailArtwork.textContent = "ZUTOMAYO";
  detailList.replaceChildren(
    ...detailRow("Singles", String(parsedSingles.length)),
    ...detailRow("Songs", String(parsedSongs.length)),
    ...detailRow("Studio", String(parsedAlbums.filter((album) => album.kind !== "tour").length)),
    ...detailRow("Live Sessions", String(parsedAlbums.filter((album) => album.kind === "tour").length)),
    ...detailRow("Timespan", `${parsedSingles[0].releaseDate} → ${parsedAlbums.at(-1).releaseDate}`),
  );
  detailLinks.replaceChildren(
    makeJumpButton("Latest Album", parsedAlbums.at(-1).id),
    makeJumpButton("First Single", parsedSingles[0].id),
    ...(firstTourAlbum ? [makeJumpButton("First Live Session", firstTourAlbum.id)] : []),
    ...getPlatformLinks(data.meta.artistJa).map((item) => makeExternalLinkButton(item.label, item.url)),
  );
}

function makeJumpButton(label, targetId) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", () => setActive(targetId));
  return button;
}

function makeExternalLinkButton(label, url) {
  const link = document.createElement("a");
  link.className = "external-link";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  return link;
}

function buildSearchQuery(title, options = {}) {
  const parts = [`"${title}"`, data.meta.artistJa, data.meta.artist];
  if (options.albumTitle) {
    parts.push(options.albumTitle);
  }
  return parts.join(" ");
}

function getPlatformLinks(title, options = {}) {
  const query = encodeURIComponent(buildSearchQuery(title, options));
  return [
    { label: "YouTube", url: options.youtubeUrl || `https://www.youtube.com/results?search_query=${query}` },
    { label: "Apple Music", url: `https://music.apple.com/jp/search?term=${query}` },
    { label: "Spotify", url: `https://open.spotify.com/search/${query}` },
  ];
}

function setArtwork(url, alt) {
  detailArtwork.className = "detail-artwork";
  detailArtwork.innerHTML = `<img src="${url}" alt="${htmlEscape(alt)}">`;
}

function renderDetail(nodeId) {
  if (!nodeId) {
    renderDefaultDetail();
    return;
  }

  if (singleById.has(nodeId)) {
    const single = singleById.get(nodeId);
    const song = songById.get(single.targetSongId);
    const koreanTitle = getKoreanTitle(single.title) ?? getKoreanTitle(song.title);
    const studioMembership = song.albumMembership.filter((membership) => membership.kind !== "tour");
    detailTitle.textContent = single.title;
    setDetailSubtitle(buildHeadingSubtitle(koreanTitle));
    setArtwork(singleArtworkById.get(single.id), `${single.title} artwork`);
    detailList.replaceChildren(
      ...detailRow("Release", single.releaseDate),
      ...detailRow("Song", htmlEscape(song.title)),
      ...detailRow(
        "Studio Release",
        studioMembership.length
          ? studioMembership.map((membership) => htmlEscape(membership.albumTitle)).join("<br>")
          : "none",
      ),
    );
    detailLinks.replaceChildren(
      ...getPlatformLinks(single.title, { youtubeUrl: single.youtubeUrl }).map((item) =>
        makeExternalLinkButton(item.label, item.url),
      ),
    );
    return;
  }

  if (songById.has(nodeId)) {
    const song = songById.get(nodeId);
    const firstAlbum = song.firstAlbumId ? albumById.get(song.firstAlbumId) : null;
    const studioMembership = song.albumMembership.filter((membership) => membership.kind !== "tour");
    const contextAlbumId = state.activeContext?.albumId;
    const contextSingleId = state.activeContext?.singleId;
    const contextMembership = contextAlbumId
      ? song.albumMembership.find((membership) => membership.albumId === contextAlbumId)
      : null;
    const contextDisplayTitle = contextMembership?.displayTitle ?? song.title;
    const koreanTitle = getKoreanTitle(contextDisplayTitle) ?? getKoreanTitle(song.title);
    const contextAlbum = contextAlbumId ? albumById.get(contextAlbumId) : null;
    const contextSingle = contextSingleId ? singleById.get(contextSingleId) : null;
    let artworkUrl =
      song.albumMembership.length > 0
        ? resolveArtworkUrl(albumById.get(song.albumMembership[0].albumId))
        : null;

    if (contextAlbumId && song.albumMembership.some((membership) => membership.albumId === contextAlbumId)) {
      artworkUrl = resolveArtworkUrl(albumById.get(contextAlbumId));
    } else if (contextSingleId && singleById.has(contextSingleId)) {
      artworkUrl = singleArtworkById.get(contextSingleId);
    }

    detailTitle.textContent = contextDisplayTitle;
    setDetailSubtitle(buildHeadingSubtitle(koreanTitle));
    setArtwork(artworkUrl ?? getFallbackArtworkUrl(song.title), `${song.title} artwork`);
    detailList.replaceChildren(
      ...detailRow("First Release", song.releaseDate),
      ...detailRow("First Album", firstAlbum ? htmlEscape(firstAlbum.title) : "standalone single"),
      ...detailRow(
        "Singles",
        song.singleIds.length
          ? song.singleIds.map((id) => htmlEscape(singleById.get(id).title)).join("<br>")
          : "none",
      ),
      ...detailRow(
        "Albums",
        studioMembership.length
          ? studioMembership.map((membership) => htmlEscape(membership.albumTitle)).join("<br>")
          : "none",
      ),
    );
    detailLinks.replaceChildren(
      ...getPlatformLinks(contextDisplayTitle, {
        albumTitle: contextMembership?.albumTitle,
        youtubeUrl: contextSingle?.youtubeUrl || contextAlbum?.youtubeUrl || firstAlbum?.youtubeUrl,
      }).map((item) =>
        makeExternalLinkButton(item.label, item.url),
      ),
    );
    return;
  }

  const album = albumById.get(nodeId);
  const connectedSongs = parsedSongs.filter((song) =>
    song.albumMembership.some((membership) => membership.albumId === album.id),
  );
  const connectedSingles = connectedSongs.flatMap((song) => song.singleIds);
  const koreanTitle = getKoreanTitle(album.title);
  detailTitle.textContent = album.title;
  setDetailSubtitle(buildHeadingSubtitle(koreanTitle, ALBUM_KIND_DETAIL_LABELS[album.kind]));
  setArtwork(resolveArtworkUrl(album, album.title), `${album.title} artwork`);
  detailList.replaceChildren(
    ...detailRow("Release", album.releaseDate),
    ...detailRow("Format", ALBUM_KIND_LABELS[album.kind]),
    ...detailRow("Tracks", `${album.trackTitles.length}`),
    ...detailRow("Linked Songs", `${connectedSongs.length}`),
    ...detailRow("Linked Singles", `${connectedSingles.length}`),
  );
  detailLinks.replaceChildren(
    ...getPlatformLinks(album.title, { youtubeUrl: album.youtubeUrl }).map((item) =>
      makeExternalLinkButton(item.label, item.url),
    ),
  );
}

function isNodeVisible(nodeId) {
  if (!nodeId || !graph) {
    return false;
  }

  if (singleById.has(nodeId)) {
    return state.filters.single;
  }

  if (albumById.has(nodeId)) {
    return state.filters[albumById.get(nodeId).kind];
  }

  if (songById.has(nodeId)) {
    const song = songById.get(nodeId);
    return getVisibleMemberships(song.id).length > 0 || (state.filters.single && song.singleIds.length > 0);
  }

  return false;
}

function setActive(nodeId, context = null) {
  if (nodeId) {
    trackAnalyticsEvent("open_detail", {
      node_id: nodeId,
      node_type: getNodeAnalyticsType(nodeId),
      context_kind: context?.kind || "direct",
    });
  }

  state.activeId = nodeId;
  state.activeContext = context;
  renderState();
}

function renderFocusDrawer() {
  const shouldOpen = Boolean(
    state.activeId && (singleById.has(state.activeId) || songById.has(state.activeId) || albumById.has(state.activeId)),
  );
  infoFooter.classList.toggle("is-open", shouldOpen);
}

function renderState() {
  const relations = getRelations(state.activeId);
  const hasActive = Boolean(state.activeId && isNodeVisible(state.activeId));

  if (viewport) {
    viewport.classed("graph-dimmed", hasActive);
  }
  syncRenderedEdges();
  if (singleSelection) {
    singleSelection
      .classed("is-active", (single) => relations.nodeIds.has(single.id))
      .classed("is-hovered", (single) => single.id === state.hoverNodeId);
  }
  if (albumSelection) {
    albumSelection
      .classed("is-active", (album) => relations.nodeIds.has(album.id))
      .classed("is-hovered", (album) => album.id === state.hoverNodeId);
  }
  if (edgeSelection) {
    edgeSelection.classed("is-active", (edge) => relations.edgeIds.has(edge.id));
  }
  if (trackGroupSelection) {
    trackGroupSelection.classed(
      "is-active",
      (track) => relations.trackKeys.has(track.key) || track.songId === state.hoverNodeId,
    );
  }

  renderDetail(state.activeId);
  renderFocusDrawer();
}

function getGraphCacheKey() {
  return LANE_ORDER.map((key) => `${key}:${state.filters[key] ? 1 : 0}`).join("|");
}

function getFocusedSongId() {
  return state.activeId && songById.has(state.activeId) ? state.activeId : null;
}

function isLiveEdge(edge) {
  return Boolean(edge.albumIdTo && albumById.get(edge.albumIdTo)?.kind === "tour");
}

function getRenderedEdges() {
  const focusedSongId = getFocusedSongId();
  return graph.edgeData.filter((edge) => {
    if (!isLiveEdge(edge)) {
      return true;
    }

    return focusedSongId ? edge.songId === focusedSongId : false;
  });
}

function syncRenderedEdges() {
  if (!edgeLayer || !graph) {
    return;
  }

  edgeSelection = edgeLayer
    .selectAll(".edge")
    .data(getRenderedEdges(), (edge) => edge.id)
    .join("path")
    .attr("class", (edge) => `edge edge-${edge.type}`)
    .attr("d", edgePath);
}

function getYearLabelY(date) {
  const baseY = yScale(date) - 10;
  if (!graph) {
    return baseY;
  }

  let lowerBound = baseY;
  let upperBound = Number.POSITIVE_INFINITY;

  for (const single of graph.singleNodes) {
    const singleTop = single.y - single.height / 2;
    const singleBottom = single.y + single.height / 2;

    if (single.parsedDate < date && singleBottom + 8 > lowerBound) {
      lowerBound = singleBottom + 8;
    }

    if (single.parsedDate >= date && singleTop - 8 < upperBound && singleTop >= baseY) {
      upperBound = singleTop - 8;
    }
  }

  return Number.isFinite(upperBound) ? Math.min(lowerBound, upperBound) : lowerBound;
}

function renderGraph() {
  const cacheKey = getGraphCacheKey();
  graph = graphCache.get(cacheKey);
  if (!graph) {
    graph = buildGraphData();
    graphCache.set(cacheKey, graph);
  }

  graphHeight = graph.height;
  yScale = createYScale(graphHeight);

  svg.selectAll("*").remove();
  svg
    .attr("viewBox", `${graph.fitViewBoxLeft} 0 ${graph.fitViewBoxWidth} ${graph.height}`)
    .attr("preserveAspectRatio", "xMinYMin meet")
    .attr("width", WIDTH)
    .attr("height", graph.height);

  defsLayer = svg.append("defs");
  const sheenGradient = defsLayer
    .append("linearGradient")
    .attr("id", "albumSheenGradient")
    .attr("x1", "0%")
    .attr("x2", "100%")
    .attr("y1", "0%")
    .attr("y2", "100%");

  sheenGradient.append("stop").attr("offset", "0%").attr("stop-color", "rgba(255,255,255,0.16)");
  sheenGradient.append("stop").attr("offset", "58%").attr("stop-color", "rgba(255,255,255,0)");
  sheenGradient.append("stop").attr("offset", "100%").attr("stop-color", "rgba(255,255,255,0.08)");

  for (const album of graph.albumNodes) {
    defsLayer
      .append("clipPath")
      .attr("id", `album-clip-${album.id}`)
      .append("rect")
      .attr("x", 0)
      .attr("y", 0)
      .attr("width", album.width)
      .attr("height", 92)
      .attr("rx", 24)
      .attr("ry", 24);
  }

  for (const single of graph.singleNodes) {
    defsLayer
      .append("clipPath")
      .attr("id", `single-clip-${single.id}`)
      .append("rect")
      .attr("x", 12)
      .attr("y", 12)
      .attr("width", 54)
      .attr("height", 54)
      .attr("rx", 14)
      .attr("ry", 14);
  }

  viewport = svg.append("g").attr("class", "viewport");
  backgroundLayer = viewport.append("g");
  edgeLayer = viewport.append("g");
  albumLayer = viewport.append("g");
  singleLayer = viewport.append("g");

  backgroundLayer
    .append("rect")
    .attr("x", graph.fitViewBoxLeft)
    .attr("y", 0)
    .attr("width", graph.fitViewBoxWidth)
    .attr("height", graph.height)
    .attr("fill", "transparent")
    .on("click", () => {
      state.lastSingleTap = null;
      setActive(null);
    });

  backgroundLayer
    .selectAll(".lane-panel")
    .data(graph.activeLaneKeys.map((key) => ({ key, ...graph.lanePanels[key] })))
    .join("rect")
    .attr("class", "lane-panel")
    .attr("x", (lane) => lane.x)
    .attr("y", 62)
    .attr("width", (lane) => lane.width)
    .attr("height", graph.height - 124)
    .attr("rx", 34)
    .attr("ry", 34);

  backgroundLayer
    .selectAll(".year-line")
    .data(yearTicks)
    .join("line")
    .attr("class", "grid-line")
    .attr("x1", graph.fitViewBoxLeft + 8)
    .attr("x2", graph.fitViewBoxRight - 8)
    .attr("y1", (date) => yScale(date))
    .attr("y2", (date) => yScale(date));

  backgroundLayer
    .selectAll(".year-label")
    .data(yearTicks)
    .join("text")
    .attr("class", "year-label")
    .attr("x", graph.fitViewBoxLeft + 12)
    .attr("y", (date) => getYearLabelY(date))
    .text((date) => date.getFullYear());

  backgroundLayer
    .selectAll(".lane-label")
    .data(graph.activeLaneKeys.map((key) => ({ key, title: LANE_LABELS[key] })))
    .join("g")
    .attr("transform", (lane) => `translate(${graph.lanePanels[lane.key].labelX}, 110)`)
    .call((group) => {
      group
        .append("text")
        .attr("class", "lane-label")
        .attr("text-anchor", "middle")
        .text((lane) => lane.title);
    });

  syncRenderedEdges();

  albumSelection = albumLayer
    .selectAll(".node-album")
    .data(graph.albumNodes)
    .join("g")
    .attr("class", "node node-album")
    .attr("transform", (album) => `translate(${album.x}, ${album.y})`)
    .on("mouseenter", (event, album) => {
      state.hoverNodeId = album.id;
      renderState();
      showTooltip(event, albumTooltip(album));
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", () => {
      state.hoverNodeId = null;
      renderState();
      hideTooltip();
    })
    .on("click", (event, album) => {
      event.stopPropagation();
      state.lastSingleTap = null;
      setActive(album.id, { kind: "album", albumId: album.id });
    });

  albumSelection
    .append("rect")
    .attr("class", "album-card-base")
    .attr("width", (album) => album.width)
    .attr("height", (album) => album.height)
    .attr("rx", 30)
    .attr("ry", 30);

  albumSelection
    .append("image")
    .attr("href", (album) => resolveArtworkUrl(album, album.title))
    .attr("width", (album) => album.width)
    .attr("height", 92)
    .attr("preserveAspectRatio", "xMidYMid slice")
    .attr("clip-path", (album) => `url(#album-clip-${album.id})`);

  albumSelection
    .append("rect")
    .attr("class", "album-card-sheen")
    .attr("width", (album) => album.width)
    .attr("height", 92)
    .attr("rx", 30)
    .attr("ry", 30);

  albumSelection
    .append("text")
    .attr("class", "album-type")
    .attr("x", 24)
    .attr("y", 118)
    .text((album) => ALBUM_KIND_LABELS[album.kind]);

  albumSelection
    .append("text")
    .attr("class", "album-date")
    .attr("x", (album) => album.width - 24)
    .attr("y", 118)
    .attr("text-anchor", "end")
    .text((album) => album.releaseDate);

  albumSelection
    .append("text")
    .attr("class", "album-title")
    .attr("x", 24)
    .attr("y", 42)
    .classed("is-compact", (album) => album.titleLines.length > 1)
    .each(function updateAlbumTitle(album) {
      const text = d3.select(this);
      text
        .selectAll("tspan")
        .data(album.titleLines)
        .join("tspan")
        .attr("x", 24)
        .attr("dy", (_, index) => (index === 0 ? 0 : 16))
        .text((line) => line);
    });

  albumSelection
    .append("text")
    .attr("class", "track-count")
    .attr("x", 24)
    .attr("y", (album) => album.height - 16)
    .text((album) => `${album.trackTitles.length} tracks`);

  trackGroupSelection = albumSelection
    .append("g")
    .selectAll(".track-proxy")
    .data((album) =>
      album.trackLayouts
        .map((track) => ({
          ...track,
          albumId: album.id,
          songId: songIdByMembershipKey.get(track.key) ?? null,
        }))
        .filter((track) => track.songId),
    )
    .join("g")
    .attr("class", "track-proxy")
    .attr(
      "transform",
      (track) =>
        `translate(${track.x - graph.albumLayouts.get(track.albumId).x}, ${track.y - graph.albumLayouts.get(track.albumId).y})`,
    )
    .on("mouseenter", (event, track) => {
      state.hoverNodeId = track.songId;
      renderState();
      showTooltip(event, songTooltip(songById.get(track.songId), track.displayTitle));
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", () => {
      state.hoverNodeId = null;
      renderState();
      hideTooltip();
    })
    .on("click", (event, track) => {
      event.stopPropagation();
      state.lastSingleTap = null;
      setActive(track.songId, { kind: "track", albumId: track.albumId });
    });

  trackGroupSelection
    .append("rect")
    .attr("class", "track-hit")
    .attr("width", (track) => track.width)
    .attr("height", (track) => track.blockHeight)
    .attr("rx", 8)
    .attr("ry", 8)
    .attr("y", -14);

  trackGroupSelection.each(function updateTrackText(track) {
    const text = d3.select(this).append("text").attr("class", "album-track-text").attr("x", 0).attr("y", 0);
    text
      .selectAll("tspan")
      .data(track.lines)
      .join("tspan")
      .attr("x", 0)
      .attr("dy", (_, index) => (index === 0 ? 0 : 16))
      .text((line) => line);
  });

  singleSelection = singleLayer
    .selectAll(".node-single")
    .data(graph.singleNodes)
    .join("g")
    .attr("class", "node node-single")
    .attr("transform", (single) => `translate(${single.x}, ${single.y - single.height / 2})`)
    .on("mouseenter", (event, single) => {
      state.hoverNodeId = single.id;
      renderState();
      showTooltip(event, singleTooltip(single));
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", () => {
      state.hoverNodeId = null;
      renderState();
      hideTooltip();
    })
    .on("click", (event, single) => {
      event.stopPropagation();
      const now = Date.now();
      const isDoubleTap =
        state.lastSingleTap &&
        state.lastSingleTap.id === single.id &&
        now - state.lastSingleTap.time < SINGLE_DOUBLE_TAP_MS;

      if (isDoubleTap) {
        state.lastSingleTap = null;
        setActive(single.targetSongId, { kind: "single-song", singleId: single.id });
        return;
      }

      state.lastSingleTap = { id: single.id, time: now };
      setActive(single.id, { kind: "single", singleId: single.id });
    })
    .on("dblclick", (event, single) => {
      event.stopPropagation();
      state.lastSingleTap = null;
      setActive(single.targetSongId, { kind: "single-song", singleId: single.id });
    });

  singleSelection
    .append("rect")
    .attr("class", "single-card-bg")
    .attr("width", (single) => single.width)
    .attr("height", (single) => single.height)
    .attr("rx", 24)
    .attr("ry", 24);

  singleSelection
    .append("rect")
    .attr("class", "single-pill")
    .attr("x", 10)
    .attr("y", 10)
    .attr("width", 58)
    .attr("height", 58)
    .attr("rx", 16)
    .attr("ry", 16);

  singleSelection
    .append("image")
    .attr("href", (single) => resolveArtworkUrl(single, single.title))
    .attr("x", 12)
    .attr("y", 12)
    .attr("width", 54)
    .attr("height", 54)
    .attr("preserveAspectRatio", "xMidYMid slice")
    .attr("clip-path", (single) => `url(#single-clip-${single.id})`);

  singleSelection
    .append("text")
    .attr("class", "single-title")
    .attr("x", 80)
    .attr("y", 33)
    .text((single) => single.shortLabel);

  singleSelection.append("title").text((single) => single.title);

  singleSelection
    .append("text")
    .attr("class", "single-date")
    .attr("x", 80)
    .attr("y", 56)
    .text((single) => single.releaseDate);
}

function syncFilterInputs() {
  filterInputs.forEach((input) => {
    input.checked = Boolean(state.filters[input.dataset.filterKind]);
  });
}

function handleFilterChange(event) {
  const input = event.currentTarget;
  const kind = input.dataset.filterKind;
  const nextChecked = input.checked;
  const activeCount = getActiveLaneKeys().length;

  if (!nextChecked && activeCount === 1) {
    input.checked = true;
    return;
  }

  state.filters[kind] = nextChecked;
  trackAnalyticsEvent("toggle_filter", {
    filter_kind: kind,
    enabled: nextChecked,
  });

  hideTooltip();
  renderGraph();

  if (state.activeId && !isNodeVisible(state.activeId)) {
    state.activeId = null;
    state.activeContext = null;
  }
  if (state.hoverNodeId && !isNodeVisible(state.hoverNodeId)) {
    state.hoverNodeId = null;
  }

  renderState();
  syncFilterInputs();
}

renderGraph();
renderState();
syncFilterInputs();

closeFocusDrawerButton.addEventListener("click", () => setActive(null));
filterInputs.forEach((input) => {
  input.addEventListener("change", handleFilterChange);
});
})().catch((error) => {
  console.error("Failed to initialize graph", error);
});

async function fetchGraphData() {
  const response = await fetch("./data/graph.json", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load graph.json: ${response.status}`);
  }
  return response.json();
}
