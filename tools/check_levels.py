# -*- coding: utf-8 -*-
"""关卡连通性验证：双界( A / B ) + 钥匙门 BFS。
确保：1) 出口可达；2) 仅用 A 界不可达（证明折叠是必需的）。
"""
from collections import deque

SOLID = set('#~')
DOOR = 'D'
EXIT = 'X'
KEY = 'K'


def check(name, A, B, verbose=False):
    assert len(A) == len(B), name
    H, W = len(A), len(A[0])
    for r in A + B:
        assert len(r) == W, (name, len(r), r)
    grids = {'A': A, 'B': B}

    def at(layer, x, y):
        return grids[layer][y][x]

    def start():
        for y in range(H):
            for x in range(W):
                if A[y][x] == '@':
                    return x, y
        raise SystemExit('no start in ' + name)

    sx, sy = start()
    # B 界同位置必须是可通行
    assert at('B', sx, sy) not in SOLID | {DOOR}, (name, 'B start blocked')

    def passable(layer, x, y, opened):
        c = at(layer, x, y)
        if c in SOLID:
            return False
        if c == DOOR:
            return (x, y, layer) in opened
        return True

    def bfs(allow_fold):
        st = (sx, sy, 'A', 0, frozenset())
        seen = {st}
        q = deque([st])
        best = None
        while q:
            x, y, lay, keys, opened = q.popleft()
            if at(lay, x, y) == EXIT:
                best = (x, y, lay)
                break
            cand = []
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < W and 0 <= ny < H):
                    continue
                c = at(lay, nx, ny)
                if c == DOOR and keys > 0:
                    cand.append((nx, ny, lay, keys - 1, opened | {(nx, ny, lay)}))
                elif passable(lay, nx, ny, opened):
                    cand.append((nx, ny, lay, keys, opened))
            if at(lay, x, y) == KEY and keys < 3:
                cand = [(cx, cy, cl, min(3, keys + 1), op) for cx, cy, cl, k, op in cand]
            if allow_fold:
                other = 'B' if lay == 'A' else 'A'
                if passable(other, x, y, opened):
                    cand.append((x, y, other, keys, opened))
            for s in cand:
                if s not in seen:
                    seen.add(s)
                    q.append(s)
        return best

    full = bfs(True)
    aonly = bfs(False)
    ok = full is not None and aonly is None
    print(('OK  ' if ok else 'FAIL') + ' ' + name +
          '  union=' + str(full) + '  A-only=' + str(aonly))
    return ok


LEVELS = []

# ---------- F1 门厅：一道折叠门 ----------
F1A = [
    '###############',
    '#@....#.......#',
    '#.....#.......#',
    '#.....#.......#',
    '#.....#.......#',
    '#.....#.......#',
    '#.....#~......#',
    '#.....#.......#',
    '#.....#.......#',
    '#.....#.......#',
    '#.....#.......#',
    '#.....#..E...X#',
    '###############',
]
F1B = [
    '###############',
    '#.....#.......#',
    '#.....#.......#',
    '#.....#.......#',
    '#.....#.......#',
    '#.....#.......#',
    '#.............#',
    '#.....#.......#',
    '#.....#.......#',
    '#.....#.......#',
    '#.....#.......#',
    '#.....#......X#',
    '###############',
]
LEVELS.append(('F1 门厅', F1A, F1B))

# ---------- F2 长廊：钥匙在另一界，门在本界 ----------
F2A = [
    '###############',
    '#@...#...#...X#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#....~...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...D....#',
    '#....#...#....#',
    '#....#...#....#',
    '###############',
]
F2B = [
    '###############',
    '#....#...#....#',
    '#....#...#....#',
    '#....#.K.#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#........#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '#....#...#....#',
    '###############',
]
LEVELS.append(('F2 长廊', F2A, F2B))

# ---------- F3 深井：三段折叠 + 剑 ----------
F3A = [
    '###############',
    '#@......#.....#',
    '#.#####.#.###.#',
    '#.#...#.#.#...#',
    '#.#.#.#.#.#.#.#',
    '#...#...#...#.#',
    '#####.#####.#.#',
    '#.....#..~..#.#',
    '#.###.#.###.#.#',
    '#...#...#...#.#',
    '#.#.#####.#.#.#',
    '#...#.....#..X#',
    '###############',
]
F3B = [
    '###############',
    '#.......#.....#',
    '#.#####.#.###.#',
    '#.#...#.#.#...#',
    '#.#.#.#.#.#.#.#',
    '#...#...#...#.#',
    '#####.#####.#.#',
    '#.....S.....#.#',
    '#.###.#.###.#.#',
    '#...#...#...#.#',
    '#.#.#####.#.#.#',
    '#...#.....#...#',
    '###############',
]
LEVELS.append(('F3 深井', F3A, F3B))

# ---------- F4 核心：Boss ----------
F4A = [
    '###############',
    '#@....#...#...#',
    '#.....#...#...#',
    '#.....+...#...#',
    '#.....#.B.#...#',
    '#.....#...#...#',
    '#.....~...#...#',
    '#.....#...#...#',
    '#.....#...#...#',
    '#.....#...#...#',
    '#.....#...#...#',
    '#.....#...#..X#',
    '###############',
]
F4B = [
    '###############',
    '#.....#...#...#',
    '#.....#...#...#',
    '#.....#...#...#',
    '#.....#...#...#',
    '#.....#...#...#',
    '#.........+...#',
    '#.....#...#...#',
    '#.....#...#...#',
    '#.....#...#...#',
    '#.....#...#...#',
    '#.....#...#...#',
    '###############',
]
LEVELS.append(('F4 核心', F4A, F4B))

if __name__ == '__main__':
    allok = True
    for n, a, b in LEVELS:
        allok &= check(n, a, b)
    print('ALL OK' if allok else 'SOME FAILED')
