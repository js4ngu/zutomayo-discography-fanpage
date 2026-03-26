const data = window.ZUTOMAYO_GRAPH_DATA;

const svg = d3.select("#graph");
const stage = document.querySelector(".graph-stage");
const infoFooter = document.querySelector(".info-footer");
const tooltip = document.getElementById("tooltip");
const zoomOutButton = document.getElementById("zoomOutButton");
const zoomInButton = document.getElementById("zoomInButton");
const fitViewButton = document.getElementById("fitViewButton");
const closeFocusDrawerButton = document.getElementById("closeFocusDrawerButton");
const detailTitle = document.getElementById("detailTitle");
const detailSubtitle = document.getElementById("detailSubtitle");
const detailArtwork = document.getElementById("detailArtwork");
const detailList = document.getElementById("detailList");
const detailLinks = document.getElementById("detailLinks");

const WIDTH = 2420;
const ZOOM_MIN = 0.22;
const ZOOM_MAX = 3.1;
const VIEW_MARGIN = { top: 150, right: 72, bottom: 110, left: 72 };
const LANE_PANELS = {
  single: { x: 68, width: 338, labelX: 236, accent: "#d8ff5f" },
  mini: { x: 540, width: 932, labelX: 1006, accent: "#8cf2ce" },
  full: { x: 1560, width: 796, labelX: 1958, accent: "#ff8a47" },
};
const ALBUM_TRACK_START_Y = 156;
const SINGLE_CARD = {
  width: Math.min(236, LANE_PANELS.single.width - 52),
  height: 78,
  x: LANE_PANELS.single.x + 24,
};
const ALBUM_CARD = {
  mini: {
    width: Math.min(420, LANE_PANELS.mini.width - 60),
    x: LANE_PANELS.mini.x + (LANE_PANELS.mini.width - Math.min(420, LANE_PANELS.mini.width - 60)) / 2,
  },
  full: {
    width: Math.min(560, LANE_PANELS.full.width - 60),
    x: LANE_PANELS.full.x + (LANE_PANELS.full.width - Math.min(560, LANE_PANELS.full.width - 60)) / 2,
  },
};

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
const HEIGHT = Math.max(3400, spanYears * 420 + 520);

const yScale = d3
  .scaleTime()
  .domain([domainStart, domainEnd])
  .range([VIEW_MARGIN.top, HEIGHT - VIEW_MARGIN.bottom]);

const yearTicks = d3.timeYear.every(1).range(
  d3.timeYear.floor(domainStart),
  d3.timeYear.offset(d3.timeYear.ceil(domainEnd), 1),
);

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

function truncateLabel(text, maxUnits) {
  let units = 0;
  let output = "";

  for (const char of text) {
    const weight = isWideChar(char) ? 1 : 0.55;
    if (units + weight > maxUnits) {
      return `${output.trimEnd()}…`;
    }
    output += char;
    units += weight;
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

function packAlbums(albums, minGap, minY) {
  const sorted = [...albums].sort((a, b) => (a.baseCenterY - b.baseCenterY) || (a.order - b.order));
  let cursor = minY;
  for (const album of sorted) {
    const targetTop = album.baseCenterY - album.height / 2;
    album.y = Math.max(targetTop, cursor);
    cursor = album.y + album.height + minGap;
  }
}

const albumLayouts = new Map();
const trackLayouts = [];

for (const album of parsedAlbums) {
  const card = ALBUM_CARD[album.kind];
  const trackMaxUnits = album.kind === "mini" ? 22 : 26;
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

  const cardHeight = cursorY + 26;
  const centerY = yScale(album.parsedDate);
  const layout = {
    ...album,
    x: card.x,
    width: card.width,
    height: cardHeight,
    baseCenterY: centerY,
    y: centerY - cardHeight / 2,
    rawTracks: wrappedTracks,
    trackLayouts: [],
  };

  albumLayouts.set(album.id, layout);
}

const albumNodes = Array.from(albumLayouts.values());
packAlbums(
  albumNodes.filter((album) => album.kind === "mini"),
  96,
  VIEW_MARGIN.top + 22,
);
packAlbums(
  albumNodes.filter((album) => album.kind === "full"),
  104,
  VIEW_MARGIN.top + 22,
);

for (const album of albumNodes) {
  album.trackLayouts = album.rawTracks.map((track) => ({
    ...track,
    key: `${album.id}::${track.order}`,
    x: album.x + 24,
    y: album.y + track.offsetY,
    width: album.width - 48,
  }));
  trackLayouts.push(...album.trackLayouts);
}

const singleNodes = parsedSingles.map((single, order) => ({
  ...single,
  order,
  x: SINGLE_CARD.x,
  width: SINGLE_CARD.width,
  height: SINGLE_CARD.height,
  shortLabel: truncateLabel(single.title, 13.2),
  baseY: yScale(single.parsedDate),
  y: yScale(single.parsedDate),
}));

packNodes(singleNodes, 92, VIEW_MARGIN.top + 30, HEIGHT - VIEW_MARGIN.bottom - 24);

const membershipAnchorByKey = new Map();
for (const song of parsedSongs) {
  song.albumMembership.forEach((membership) => {
    const anchor = albumLayouts
      .get(membership.albumId)
      .trackLayouts.find((track) => track.order === membership.order);
    membershipAnchorByKey.set(`${song.id}::${membership.albumId}`, {
      x: anchor.x,
      y: anchor.y + 12,
      trackKey: anchor.key,
      albumId: membership.albumId,
      songId: song.id,
      displayTitle: membership.displayTitle,
    });
  });
}

const edgeData = [];
for (const single of singleNodes) {
  const song = songById.get(single.targetSongId);
  const firstMembership = song.albumMembership[0];
  const firstAnchor = membershipAnchorByKey.get(`${song.id}::${firstMembership.albumId}`);

  edgeData.push({
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
  });
}

for (const song of parsedSongs) {
  if (song.albumMembership.length < 2) {
    continue;
  }

  const firstMembership = song.albumMembership[0];
  const firstAnchor = membershipAnchorByKey.get(`${song.id}::${firstMembership.albumId}`);

  song.albumMembership.slice(1).forEach((membership) => {
    const anchor = membershipAnchorByKey.get(`${song.id}::${membership.albumId}`);
    edgeData.push({
      id: `edge-included-${song.id}-${membership.albumId}`,
      type: "included",
      songId: song.id,
      singleId: null,
      albumIdFrom: firstMembership.albumId,
      albumIdTo: membership.albumId,
      points: {
        x1: firstAnchor.x + 24,
        y1: firstAnchor.y,
        x2: anchor.x,
        y2: anchor.y,
      },
    });
  });
}

svg
  .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
  .attr("preserveAspectRatio", "xMinYMin meet")
  .attr("width", WIDTH)
  .attr("height", HEIGHT);

function edgePath(edge) {
  const { x1, y1, x2, y2 } = edge.points;
  const mid = x1 + (x2 - x1) * 0.44;
  return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`;
}

const state = {
  activeId: null,
  activeContext: null,
  hoverNodeId: null,
};

const defs = svg.append("defs");

const sheenGradient = defs
  .append("linearGradient")
  .attr("id", "albumSheenGradient")
  .attr("x1", "0%")
  .attr("x2", "100%")
  .attr("y1", "0%")
  .attr("y2", "100%");

sheenGradient.append("stop").attr("offset", "0%").attr("stop-color", "rgba(255,255,255,0.16)");
sheenGradient.append("stop").attr("offset", "58%").attr("stop-color", "rgba(255,255,255,0)");
sheenGradient.append("stop").attr("offset", "100%").attr("stop-color", "rgba(255,255,255,0.08)");

for (const album of parsedAlbums) {
  defs
    .append("clipPath")
    .attr("id", `album-clip-${album.id}`)
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", ALBUM_CARD[album.kind].width)
    .attr("height", 92)
    .attr("rx", 24)
    .attr("ry", 24);
}

for (const single of parsedSingles) {
  defs
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

const viewport = svg.append("g").attr("class", "viewport");
const backgroundLayer = viewport.append("g");
const edgeLayer = viewport.append("g");
const albumLayer = viewport.append("g");
const singleLayer = viewport.append("g");

backgroundLayer
  .append("rect")
  .attr("x", 0)
  .attr("y", 0)
  .attr("width", WIDTH)
  .attr("height", HEIGHT)
  .attr("fill", "transparent")
  .on("click", () => setActive(null));

backgroundLayer
  .selectAll(".lane-panel")
  .data(Object.entries(LANE_PANELS))
  .join("rect")
  .attr("class", "lane-panel")
  .attr("x", ([, lane]) => lane.x)
  .attr("y", 62)
  .attr("width", ([, lane]) => lane.width)
  .attr("height", HEIGHT - 124)
  .attr("rx", 34)
  .attr("ry", 34);

backgroundLayer
  .selectAll(".year-line")
  .data(yearTicks)
  .join("line")
  .attr("class", "grid-line")
  .attr("x1", 44)
  .attr("x2", WIDTH - 44)
  .attr("y1", (date) => yScale(date))
  .attr("y2", (date) => yScale(date));

backgroundLayer
  .selectAll(".year-label")
  .data(yearTicks)
  .join("text")
  .attr("class", "year-label")
  .attr("x", 48)
  .attr("y", (date) => yScale(date) - 10)
  .text((date) => date.getFullYear());

backgroundLayer
  .selectAll(".lane-label")
  .data([
    { key: "single", title: "Single", subtitle: "발매 이벤트" },
    { key: "mini", title: "Mini Album", subtitle: "초기 수록 / 확장" },
    { key: "full", title: "Full Album", subtitle: "정규 수록 / 정착" },
  ])
  .join("g")
  .attr("transform", (lane) => `translate(${LANE_PANELS[lane.key].labelX}, 110)`)
  .call((group) => {
    group
      .append("text")
      .attr("class", "lane-label")
      .attr("text-anchor", "middle")
      .text((lane) => lane.title);

    group
      .append("text")
      .attr("class", "lane-sublabel")
      .attr("text-anchor", "middle")
      .attr("y", 24)
      .text((lane) => lane.subtitle);
  });

const edgeSelection = edgeLayer
  .selectAll(".edge")
  .data(edgeData)
  .join("path")
  .attr("class", (edge) => `edge edge-${edge.type}`)
  .attr("d", edgePath);

const albumSelection = albumLayer
  .selectAll(".node-album")
  .data(Array.from(albumLayouts.values()))
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
  .attr("href", (album) => album.artworkUrl)
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
  .text((album) => (album.kind === "mini" ? "MINI ALBUM" : "FULL ALBUM"));

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
  .attr("y", 74)
  .text((album) => album.title);

albumSelection
  .append("text")
  .attr("class", "track-count")
  .attr("x", 24)
  .attr("y", (album) => album.height - 16)
  .text((album) => `${album.trackTitles.length} tracks`);

const trackGroupSelection = albumSelection
  .append("g")
  .selectAll(".track-proxy")
  .data((album) =>
    album.trackLayouts.map((track) => {
      const song = parsedSongs.find((item) =>
        item.albumMembership.some(
          (membership) => membership.albumId === album.id && membership.order === track.order,
        ),
      );
      return {
        ...track,
        albumId: album.id,
        songId: song?.id ?? null,
      };
    }).filter((track) => track.songId),
  )
  .join("g")
  .attr("class", "track-proxy")
  .attr("transform", (track) => `translate(${track.x - ALBUM_CARD[albumById.get(track.albumId).kind].x}, ${track.y - albumLayouts.get(track.albumId).y})`)
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

trackGroupSelection.each(function appendTrackText(track) {
  const text = d3
    .select(this)
    .append("text")
    .attr("class", "album-track-text")
    .attr("x", 0)
    .attr("y", 0);

  track.lines.forEach((line, index) => {
    text
      .append("tspan")
      .attr("x", 0)
      .attr("dy", index === 0 ? 0 : 16)
      .text(line);
  });
});

const singleSelection = singleLayer
  .selectAll(".node-single")
  .data(singleNodes)
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
    setActive(single.id, { kind: "single", singleId: single.id });
  })
  .on("dblclick", (event, single) => {
    event.stopPropagation();
    setActive(single.targetSongId, { kind: "single-song", singleId: single.id });
  });

singleSelection
  .append("rect")
  .attr("class", "single-card-bg")
  .attr("width", SINGLE_CARD.width)
  .attr("height", SINGLE_CARD.height)
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
  .attr("href", (single) => single.artworkUrl)
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

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function albumTooltip(album) {
  return `<strong>${htmlEscape(album.title)}</strong>${album.kind === "mini" ? "Mini Album" : "Full Album"}<br>${album.releaseDate}<br>${album.trackTitles.length} tracks`;
}

function songTooltip(song, displayTitle = null) {
  const name = displayTitle ?? song.title;
  return `<strong>${htmlEscape(name)}</strong>Song node<br>first release ${song.releaseDate}<br>${song.albumMembership.length} album link(s)`;
}

function singleTooltip(single) {
  return `<strong>${htmlEscape(single.title)}</strong>Single event<br>${single.releaseDate}<br>${htmlEscape(single.collectionName)}`;
}

function moveTooltip(event) {
  const rect = stage.getBoundingClientRect();
  const x = Math.min(event.clientX - rect.left + 18, rect.width - tooltip.offsetWidth - 14);
  const y = Math.min(event.clientY - rect.top + 18, rect.height - tooltip.offsetHeight - 14);
  tooltip.style.left = `${Math.max(14, x)}px`;
  tooltip.style.top = `${Math.max(14, y)}px`;
}

function showTooltip(event, html) {
  tooltip.hidden = false;
  tooltip.innerHTML = html;
  moveTooltip(event);
}

function hideTooltip() {
  tooltip.hidden = true;
}

function getRelations(nodeId) {
  if (!nodeId) {
    return { nodeIds: new Set(), edgeIds: new Set(), trackKeys: new Set() };
  }

  if (singleById.has(nodeId)) {
    const single = singleById.get(nodeId);
    const song = songById.get(single.targetSongId);
    const albumIds = song.albumMembership.map((membership) => membership.albumId);
    return {
      nodeIds: new Set([single.id, song.id, ...albumIds]),
      edgeIds: new Set(edgeData.filter((edge) => edge.songId === song.id).map((edge) => edge.id)),
      trackKeys: new Set(song.albumMembership.map((membership) => `${membership.albumId}::${membership.order}`)),
    };
  }

  if (songById.has(nodeId)) {
    const song = songById.get(nodeId);
    const albumIds = song.albumMembership.map((membership) => membership.albumId);
    return {
      nodeIds: new Set([song.id, ...song.singleIds, ...albumIds]),
      edgeIds: new Set(edgeData.filter((edge) => edge.songId === song.id).map((edge) => edge.id)),
      trackKeys: new Set(song.albumMembership.map((membership) => `${membership.albumId}::${membership.order}`)),
    };
  }

  const album = albumById.get(nodeId);
  const songs = parsedSongs.filter((song) =>
    song.albumMembership.some((membership) => membership.albumId === album.id),
  );
  const singleIds = songs.flatMap((song) => song.singleIds);
  const relatedAlbumIds = songs.flatMap((song) => song.albumMembership.map((membership) => membership.albumId));
  return {
    nodeIds: new Set([album.id, ...songs.map((song) => song.id), ...singleIds, ...relatedAlbumIds]),
    edgeIds: new Set(
      edgeData.filter((edge) => songs.some((song) => song.id === edge.songId)).map((edge) => edge.id),
    ),
    trackKeys: new Set(
      songs.flatMap((song) =>
        song.albumMembership.map((membership) => `${membership.albumId}::${membership.order}`),
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

function renderDefaultDetail() {
  detailTitle.textContent = data.meta.title;
  detailSubtitle.textContent = "노드 또는 앨범 내부 트랙을 클릭하면 연결된 싱글, 곡, 앨범 경로를 강조합니다.";
  detailArtwork.className = "detail-artwork detail-artwork-empty";
  detailArtwork.textContent = "ZUTOMAYO";
  detailList.replaceChildren(
    ...detailRow("Singles", String(parsedSingles.length)),
    ...detailRow("Songs", String(parsedSongs.length)),
    ...detailRow("Albums", String(parsedAlbums.length)),
    ...detailRow("Timespan", `${parsedSingles[0].releaseDate} → ${parsedAlbums.at(-1).releaseDate}`),
  );
  detailLinks.replaceChildren(
    makeJumpButton("Latest Album", parsedAlbums.at(-1).id),
    makeJumpButton("First Single", parsedSingles[0].id),
  );
}

function makeJumpButton(label, targetId) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", () => setActive(targetId));
  return button;
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
    detailTitle.textContent = single.title;
    detailSubtitle.textContent = "single release event";
    setArtwork(single.artworkUrl, `${single.title} artwork`);
    detailList.replaceChildren(
      ...detailRow("Release", single.releaseDate),
      ...detailRow("Source", htmlEscape(single.collectionName)),
      ...detailRow("Song", htmlEscape(song.title)),
      ...detailRow("Included In", song.albumMembership.map((membership) => htmlEscape(membership.albumTitle)).join("<br>")),
    );
    detailLinks.replaceChildren(
      makeJumpButton("Open Song", song.id),
      ...song.albumMembership.map((membership) => makeJumpButton(membership.albumTitle, membership.albumId)),
    );
    return;
  }

  if (songById.has(nodeId)) {
    const song = songById.get(nodeId);
    const firstAlbum = albumById.get(song.firstAlbumId);
    const contextAlbumId = state.activeContext?.albumId;
    const contextSingleId = state.activeContext?.singleId;
    let artworkUrl = albumById.get(song.albumMembership[0].albumId).artworkUrl;

    if (
      contextAlbumId &&
      song.albumMembership.some((membership) => membership.albumId === contextAlbumId)
    ) {
      artworkUrl = albumById.get(contextAlbumId).artworkUrl;
    } else if (contextSingleId && singleById.has(contextSingleId)) {
      artworkUrl = singleById.get(contextSingleId).artworkUrl;
    }

    detailTitle.textContent = song.title;
    detailSubtitle.textContent = "song node";
    setArtwork(artworkUrl, `${song.title} artwork`);
    detailList.replaceChildren(
      ...detailRow("First Release", song.releaseDate),
      ...detailRow("First Album", htmlEscape(firstAlbum.title)),
      ...detailRow("Singles", song.singleIds.length ? song.singleIds.map((id) => htmlEscape(singleById.get(id).title)).join("<br>") : "none"),
      ...detailRow("Albums", song.albumMembership.map((membership) => htmlEscape(membership.albumTitle)).join("<br>")),
    );
    detailLinks.replaceChildren(
      ...song.singleIds.map((singleId) => makeJumpButton(singleById.get(singleId).title, singleId)),
      ...song.albumMembership.map((membership) => makeJumpButton(membership.albumTitle, membership.albumId)),
    );
    return;
  }

  const album = albumById.get(nodeId);
  const connectedSongs = parsedSongs.filter((song) =>
    song.albumMembership.some((membership) => membership.albumId === album.id),
  );
  const connectedSingles = connectedSongs.flatMap((song) => song.singleIds);
  detailTitle.textContent = album.title;
  detailSubtitle.textContent = album.kind === "mini" ? "mini album" : "full album";
  setArtwork(album.artworkUrl, `${album.title} artwork`);
  detailList.replaceChildren(
    ...detailRow("Release", album.releaseDate),
    ...detailRow("Tracks", `${album.trackTitles.length}`),
    ...detailRow("Linked Songs", `${connectedSongs.length}`),
    ...detailRow("Linked Singles", `${connectedSingles.length}`),
  );
  detailLinks.replaceChildren(
    ...connectedSongs.slice(0, 6).map((song) => makeJumpButton(song.title, song.id)),
  );
}

function setActive(nodeId, context = null) {
  state.activeId = nodeId;
  state.activeContext = context;
  renderState();
}

function renderFocusDrawer() {
  const shouldOpen = Boolean(state.activeId && songById.has(state.activeId));
  infoFooter.classList.toggle("is-open", shouldOpen);
}

function renderState() {
  const relations = getRelations(state.activeId);
  const hasActive = Boolean(state.activeId);

  viewport.classed("graph-dimmed", hasActive);

  singleSelection
    .classed("is-active", (single) => relations.nodeIds.has(single.id))
    .classed("is-hovered", (single) => single.id === state.hoverNodeId);

  albumSelection
    .classed("is-active", (album) => relations.nodeIds.has(album.id))
    .classed("is-hovered", (album) => album.id === state.hoverNodeId);

  edgeSelection.classed("is-active", (edge) => relations.edgeIds.has(edge.id));

  trackGroupSelection.classed(
    "is-active",
    (track) =>
      relations.trackKeys.has(track.key) ||
      track.songId === state.hoverNodeId,
  );

  renderDetail(state.activeId);
  renderFocusDrawer();
}

renderDefaultDetail();
renderState();

function getReadingTransform() {
  const rect = stage.getBoundingClientRect();
  const scale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (rect.width - 42) / WIDTH));
  const tx = (rect.width - WIDTH * scale) / 2;
  const ty = 14;
  return d3.zoomIdentity.translate(tx, ty).scale(scale);
}

function getWidthFitTransform() {
  const rect = stage.getBoundingClientRect();
  const scale = Math.max(
    ZOOM_MIN,
    Math.min(
      ZOOM_MAX,
      (rect.width - 24) / WIDTH,
    ),
  );
  const tx = (rect.width - WIDTH * scale) / 2;
  const ty = 14;
  return d3.zoomIdentity.translate(tx, ty).scale(scale);
}

function applyZoomStep(direction) {
  const factor = direction > 0 ? 1.2 : 0.84;
  svg.transition().duration(180).call(zoom.scaleBy, factor);
}

const zoom = d3
  .zoom()
  .scaleExtent([ZOOM_MIN, ZOOM_MAX])
  .translateExtent([
    [-48, -48],
    [WIDTH + 48, HEIGHT + 48],
  ])
  .filter((event) => {
    if (event.type === "dblclick") {
      return false;
    }
    if (event.type === "mousedown") {
      return event.button === 0;
    }
    return true;
  })
  .wheelDelta((event) => -event.deltaY * 0.0016)
  .on("zoom", (event) => {
    viewport.attr("transform", event.transform);
  })
  .on("start end", (event) => {
    const isPanning = event.type === "start";
    svg.classed("is-panning", isPanning);
    stage.classList.toggle("is-panning", isPanning);
  });

svg.call(zoom);
svg.on("dblclick.zoom", null);

function applyReadingView() {
  svg.transition().duration(360).call(zoom.transform, getReadingTransform());
}

function applyWidthFit() {
  svg.transition().duration(300).call(zoom.transform, getWidthFitTransform());
}

applyReadingView();

zoomOutButton.addEventListener("click", () => applyZoomStep(-1));
zoomInButton.addEventListener("click", () => applyZoomStep(1));
fitViewButton.addEventListener("click", applyWidthFit);
closeFocusDrawerButton.addEventListener("click", () => setActive(null));

window.addEventListener("resize", () => {
  applyReadingView();
});
