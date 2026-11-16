"""Small geometry helpers: distances, the route's end-to-end line, positions along it."""
import heapq
import math


def hav_km(a, b):
    radius = 6371.0088
    p1, p2 = math.radians(a[1]), math.radians(b[1])
    dp, dl = p2 - p1, math.radians(b[0] - a[0])
    return 2 * radius * math.asin(math.sqrt(math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2))


def main_line(pieces):
    """The longest end-to-end path through a route's mapped pieces.

    OSM route relations arrive as pieces that meet at junctions, with small loops,
    spurs and sometimes both directions of a road. The route a rider follows is the
    longest shortest-path between two ends of that network.
    Returns (ordered [lon, lat] list, share of all mapped length that lies on it).
    """
    key = lambda c: (round(c[0], 5), round(c[1], 5))
    lengths = [sum(hav_km(p[i], p[i + 1]) for i in range(len(p) - 1)) for p in pieces]
    adj = {}
    for i, piece in enumerate(pieces):
        a, b = key(piece[0]), key(piece[-1])
        adj.setdefault(a, []).append((b, i, False))
        adj.setdefault(b, []).append((a, i, True))

    def dijkstra(src):
        dist, prev, heap = {src: 0.0}, {}, [(0.0, src)]
        while heap:
            d, u = heapq.heappop(heap)
            if d > dist.get(u, 1e18):
                continue
            for v, i, rev in adj[u]:
                nd = d + lengths[i]
                if nd < dist.get(v, 1e18):
                    dist[v], prev[v] = nd, (u, i, rev)
                    heapq.heappush(heap, (nd, v))
        return dist, prev

    ends = [n for n, edges in adj.items() if len(edges) == 1] or list(adj)
    best = (0.0, None, None, None)
    for src in ends[:60]:
        dist, prev = dijkstra(src)
        far = max(dist, key=dist.get)
        if dist[far] > best[0]:
            best = (dist[far], src, far, prev)
    total, src, node, prev = best
    path = []
    while node != src:
        u, i, rev = prev[node]
        seg = pieces[i][::-1] if rev else pieces[i]
        path = list(seg) + path[1:] if path else list(seg)
        node = u
    share = total / sum(lengths) if sum(lengths) else 0
    return path, share


class Line:
    def __init__(self, path):
        self.path = path
        self.cum = [0.0]
        for i in range(1, len(path)):
            self.cum.append(self.cum[-1] + hav_km(path[i - 1], path[i]))
        self.km = self.cum[-1]
        self._scale = math.cos(math.radians(path[0][1])) ** 2

    def locate(self, lon, lat):
        """(kilometre along the line, metres away from it) for a point."""
        j = min(range(len(self.path)), key=lambda i: (self.path[i][0] - lon) ** 2 * self._scale + (self.path[i][1] - lat) ** 2)
        return round(self.cum[j], 2), round(hav_km(self.path[j], (lon, lat)) * 1000)

    def at_km(self, k):
        j = min(range(len(self.cum)), key=lambda i: abs(self.cum[i] - k))
        return self.path[j]

    def thinned(self, max_points=700):
        step = max(1, len(self.path) // max_points)
        pts = [[round(c[0], 5), round(c[1], 5)] for c in self.path[::step]]
        last = [round(self.path[-1][0], 5), round(self.path[-1][1], 5)]
        return pts if pts[-1] == last else pts + [last]


class NearIndex:
    """Nearest-line lookups for many points, done locally instead of in the database.

    lines: [(label, [[lon, lat], ...]), ...]. Distances in metres on a flat projection
    around the lines' middle latitude: good to a few metres across one municipality.
    """

    CELL = 1000.0  # metres

    def __init__(self, lines):
        lats = [c[1] for _, coords in lines for c in coords] or [46.0]
        self._kx = 111195.0 * math.cos(math.radians((min(lats) + max(lats)) / 2))
        self._ky = 111195.0
        self.labels = [label for label, _ in lines]
        self.grid = {}
        for li, (_, coords) in enumerate(lines):
            pts = [self._xy(c[0], c[1]) for c in coords]
            for a, b in zip(pts, pts[1:]):
                seg = (a[0], a[1], b[0], b[1], li)
                for gx in range(int(min(a[0], b[0]) // self.CELL), int(max(a[0], b[0]) // self.CELL) + 1):
                    for gy in range(int(min(a[1], b[1]) // self.CELL), int(max(a[1], b[1]) // self.CELL) + 1):
                        self.grid.setdefault((gx, gy), []).append(seg)

    def _xy(self, lon, lat):
        return lon * self._kx, lat * self._ky

    @staticmethod
    def _dist(px, py, seg):
        ax, ay, bx, by, _ = seg
        dx, dy = bx - ax, by - ay
        t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        return math.hypot(px - ax - t * dx, py - ay - t * dy)

    def nearest(self, lon, lat, max_m=60000, tie_m=0):
        """(label, metres) of the nearest line, or None when none is within max_m.

        Lines within tie_m of the nearest count as a tie (two routes on one road);
        the tie goes to the line listed first.
        """
        if not self.grid:
            return None
        px, py = self._xy(lon, lat)
        cx, cy = int(px // self.CELL), int(py // self.CELL)
        per_line, best = {}, float("inf")
        for ring in range(int(max_m // self.CELL) + 2):
            cells = [(cx + i, cy + j) for i in range(-ring, ring + 1) for j in range(-ring, ring + 1) if max(abs(i), abs(j)) == ring]
            for cell in cells:
                for seg in self.grid.get(cell, ()):
                    d = self._dist(px, py, seg)
                    if d < per_line.get(seg[4], float("inf")):
                        per_line[seg[4]] = d
                        best = min(best, d)
            if per_line and best + tie_m <= ring * self.CELL:
                break
        if not per_line or best > max_m:
            return None
        line = min(i for i, d in per_line.items() if d <= best + tie_m)
        return self.labels[line], round(per_line[line])

    def within(self, lon, lat, metres):
        hit = self.nearest(lon, lat, max_m=metres)
        return hit is not None
