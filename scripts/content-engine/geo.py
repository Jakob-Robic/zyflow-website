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
