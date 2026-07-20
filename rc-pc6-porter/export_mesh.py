#!/usr/bin/env python3
"""Export RC modelu PC-6 Porter (1:8) do meshe - STL/GLB pro import do Fusionu.

Stejna geometrie a parametry jako PC6PorterKit/PC6PorterKit.py (Fusion API
skript), ale postavena pres trimesh, takze jde spustit kdekoli bez Fusionu.
Vystup: exports/pc6_porter_kit.glb (pojmenovane dily, barevne),
exports/pc6_porter_combined.stl a STL po komponentach (pro Insert Mesh).

Pozn.: drazky (zarezy) do zeber/prepazek se zde nerezou - dily se prekryvaji;
parametricky model s drazkami vytvori Fusion skript.
"""
import os
import numpy as np
import trimesh
from shapely.geometry import Polygon

# --- parametry shodne s PC6PorterKit.py (mm, meritko 1:8) ------------------
WING_SPAN = 1984.0
WING_CHORD = 238.0
WING_LE_X = 430.0
WING_Z = 118.0
RIB_COUNT = 13
RIB_T = 3.0
RIB_Y_START = 25.0
MAIN_SPAR_POS = 0.28
REAR_SPAR_POS = 0.72
SPAR_T = 5.0
LE_SQ = 8.0
TE_W = 20.0
TE_T = 6.0

FUSE_LEN = 1330.0
FIREWALL_X = 180.0
FORMER_T = 3.0
FIREWALL_T = 5.0
LONGERON_SQ = 6.0
CABIN_W, CABIN_H, CABIN_ZC = 150.0, 210.0, 10.0
TAIL_W, TAIL_H, TAIL_ZC = 20.0, 55.0, 35.0
CABIN_END_X = 600.0
FORMER_STATIONS = [180.0, 320.0, 460.0, 600.0, 780.0, 960.0, 1140.0, 1330.0]

STAB_SPAN = 620.0
STAB_ROOT = 150.0
STAB_TIP = 100.0
STAB_LE_X = 1150.0
STAB_Z = 70.0
TAIL_T = 6.0
ELEV_W = 60.0
FIN_H = 250.0
RUD_W = 70.0

GEAR_TRACK = 375.0
WHEEL_D = 90.0
WHEEL_W = 24.0
STRUT_W, STRUT_T = 25.0, 6.0

CLARK_Y_UPPER = [
    (0.0, 0.0), (0.0125, 0.0293), (0.025, 0.0402), (0.05, 0.0553),
    (0.075, 0.0664), (0.10, 0.0747), (0.15, 0.0868), (0.20, 0.0941),
    (0.30, 0.1002), (0.40, 0.0983), (0.50, 0.0898), (0.60, 0.0771),
    (0.70, 0.0610), (0.80, 0.0428), (0.90, 0.0224), (0.95, 0.0119),
    (1.0, 0.0012),
]
CLARK_Y_LOWER = [
    (0.0, 0.0), (0.0125, -0.0158), (0.025, -0.0227), (0.05, -0.0301),
    (0.075, -0.0333), (0.10, -0.0342), (0.15, -0.0335), (0.20, -0.0304),
    (0.30, -0.0239), (0.40, -0.0180), (0.50, -0.0140), (0.60, -0.0100),
    (0.70, -0.0065), (0.80, -0.0039), (0.90, -0.0016), (0.95, -0.0006),
    (1.0, 0.0),
]

BALSA = [222, 184, 135, 255]
SPRUCE = [160, 110, 60, 255]
PLY = [200, 160, 90, 255]
GREY = [120, 120, 130, 255]
BLACK = [40, 40, 40, 255]
RED = [190, 60, 50, 255]


def extrude_xz(coords_xz, thickness, y_center):
    """Vytazeni polygonu v rovine XZ podel osy Y (zebra, kyl, smerovka)."""
    mesh = trimesh.creation.extrude_polygon(Polygon(coords_xz), thickness)
    rot = trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0])
    mesh.apply_transform(rot)  # (x, y, z) -> (x, -z, y)
    mesh.apply_translation([0, y_center + thickness / 2, 0])
    return mesh


def extrude_yz(coords_yz, thickness, x_center, hole=None):
    """Vytazeni polygonu v rovine YZ podel osy X (prepazky)."""
    poly = Polygon(coords_yz, [hole] if hole else None)
    mesh = trimesh.creation.extrude_polygon(poly, thickness)
    perm = np.array([[0, 0, 1, 0], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1]],
                    dtype=float)  # local (y, z, ext) -> world (x, y, z)
    mesh.apply_transform(perm)
    mesh.apply_translation([x_center - thickness / 2, 0, 0])
    return mesh


def extrude_xy(coords_xy, thickness, z_center):
    """Vytazeni polygonu v rovine XY podel osy Z (VOP, vyskovka)."""
    mesh = trimesh.creation.extrude_polygon(Polygon(coords_xy), thickness)
    mesh.apply_translation([0, 0, z_center - thickness / 2])
    return mesh


def box_at(extents, center):
    mesh = trimesh.creation.box(extents=extents)
    mesh.apply_translation(center)
    return mesh


def beam(p1, p2, w, h):
    """Sikmy nosnik obdelnikoveho prurezu mezi dvema body."""
    p1, p2 = np.asarray(p1, float), np.asarray(p2, float)
    d = p2 - p1
    length = np.linalg.norm(d)
    mesh = trimesh.creation.box(extents=[length, w, h])
    mesh.apply_transform(trimesh.geometry.align_vectors([1, 0, 0], d / length))
    mesh.apply_translation((p1 + p2) / 2)
    return mesh


def wheel(radius, width, center):
    mesh = trimesh.creation.cylinder(radius=radius, height=width, sections=48)
    mesh.apply_transform(
        trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    mesh.apply_translation(center)
    return mesh


def airfoil_coords():
    pts = []
    for xc, yc in reversed(CLARK_Y_UPPER):
        pts.append((WING_LE_X + xc * WING_CHORD, WING_Z + yc * WING_CHORD))
    for xc, yc in CLARK_Y_LOWER[1:]:
        pts.append((WING_LE_X + xc * WING_CHORD, WING_Z + yc * WING_CHORD))
    return pts


def airfoil_z(pos, table):
    for i in range(len(table) - 1):
        x0, y0 = table[i]
        x1, y1 = table[i + 1]
        if x0 <= pos <= x1:
            return (y0 + (pos - x0) / (x1 - x0) * (y1 - y0)) * WING_CHORD
    return table[-1][1] * WING_CHORD


def former_dims(x):
    if x <= CABIN_END_X:
        return CABIN_W, CABIN_H, CABIN_ZC
    t = (x - CABIN_END_X) / (FUSE_LEN - CABIN_END_X)
    return (CABIN_W + t * (TAIL_W - CABIN_W),
            CABIN_H + t * (TAIL_H - CABIN_H),
            CABIN_ZC + t * (TAIL_ZC - CABIN_ZC))


def build():
    groups = {}  # component -> list of (name, mesh, color)

    # --- kridla ---
    half = WING_SPAN / 2
    foil = airfoil_coords()
    for side, label in ((1, 'R'), (-1, 'L')):
        parts = []
        ys = [side * (RIB_Y_START + i * (half - RIB_Y_START) / (RIB_COUNT - 1))
              for i in range(RIB_COUNT)]
        for i, y in enumerate(ys):
            parts.append(('rib_%s%d' % (label, i + 1),
                          extrude_xz(foil, RIB_T, y - RIB_T / 2), BALSA))
        y_in, y_out = min(ys), max(ys)
        length = y_out - y_in
        y_mid = (y_in + y_out) / 2
        for pos, t, name in ((MAIN_SPAR_POS, SPAR_T, 'main_spar'),
                             (REAR_SPAR_POS, SPAR_T, 'rear_spar')):
            zlo = airfoil_z(pos, CLARK_Y_LOWER)
            zhi = airfoil_z(pos, CLARK_Y_UPPER)
            parts.append(('%s_%s' % (name, label), box_at(
                [t, length, (zhi - zlo) * 0.9],
                [WING_LE_X + pos * WING_CHORD, y_mid,
                 WING_Z + (zlo + zhi) / 2]), SPRUCE))
        parts.append(('le_strip_' + label, box_at(
            [LE_SQ, length, LE_SQ],
            [WING_LE_X + 2, y_mid, WING_Z + 2]), BALSA))
        parts.append(('te_strip_' + label, box_at(
            [TE_W, length, TE_T],
            [WING_LE_X + WING_CHORD - TE_W / 2, y_mid, WING_Z + 1]), BALSA))
        groups['wing_' + label] = parts

    # --- trup ---
    parts = []
    for i, x in enumerate(FORMER_STATIONS):
        w, h, zc = former_dims(x)
        rect = [(-w / 2, zc - h / 2), (w / 2, zc - h / 2),
                (w / 2, zc + h / 2), (-w / 2, zc + h / 2)]
        hole = None
        thick = FORMER_T
        if i == 0:
            thick = FIREWALL_T
        elif min(w, h) > 45:
            r = min(w, h) * 0.225
            ang = np.linspace(0, 2 * np.pi, 32, endpoint=False)
            hole = [(r * np.cos(a), zc + r * np.sin(a)) for a in ang]
        parts.append(('former_F%d' % (i + 1),
                      extrude_yz(rect, thick, x + thick / 2,
                                 hole=hole), PLY if i == 0 else BALSA))
    ins = LONGERON_SQ / 2
    for sy in (1, -1):
        for sz in (1, -1):
            key = []
            for x in (FORMER_STATIONS[0], CABIN_END_X, FUSE_LEN):
                w, h, zc = former_dims(x)
                key.append((x, sy * (w / 2 - ins), zc + sz * (h / 2 - ins)))
            tag = ('P' if sy > 0 else 'L') + ('h' if sz > 0 else 'd')
            parts.append(('longeron_%s_cabin' % tag,
                          beam(key[0], key[1], LONGERON_SQ, LONGERON_SQ),
                          SPRUCE))
            parts.append(('longeron_%s_tail' % tag,
                          beam(key[1], key[2], LONGERON_SQ, LONGERON_SQ),
                          SPRUCE))
    groups['fuselage'] = parts

    # --- ocasni plochy ---
    parts = []
    te_x = STAB_LE_X + STAB_ROOT
    sweep = STAB_ROOT - STAB_TIP
    stab = [(STAB_LE_X, 0), (STAB_LE_X + sweep, STAB_SPAN / 2),
            (te_x, STAB_SPAN / 2), (te_x, -STAB_SPAN / 2),
            (STAB_LE_X + sweep, -STAB_SPAN / 2)]
    parts.append(('stabilizer', extrude_xy(stab, TAIL_T, STAB_Z), BALSA))
    elev = [(te_x + 2, -STAB_SPAN / 2), (te_x + 2 + ELEV_W, -STAB_SPAN / 2),
            (te_x + 2 + ELEV_W, STAB_SPAN / 2), (te_x + 2, STAB_SPAN / 2)]
    parts.append(('elevator', extrude_xy(elev, TAIL_T, STAB_Z), BALSA))
    fin_top = STAB_Z + FIN_H
    fin = [(STAB_LE_X, STAB_Z), (STAB_LE_X + 70, fin_top),
           (te_x, fin_top), (te_x, STAB_Z)]
    parts.append(('fin', extrude_xz(fin, TAIL_T, -TAIL_T / 2), BALSA))
    rud = [(te_x + 2, STAB_Z - 20), (te_x + 2, fin_top),
           (te_x + 2 + RUD_W, fin_top - 40), (te_x + 2 + RUD_W, STAB_Z - 20)]
    parts.append(('rudder', extrude_xz(rud, TAIL_T, -TAIL_T / 2), BALSA))
    groups['tail'] = parts

    # --- podvozek ---
    parts = []
    z_bottom = CABIN_ZC - CABIN_H / 2
    axle_z = z_bottom - 155.0
    for sy, label in ((1, 'R'), (-1, 'L')):
        parts.append(('gear_leg_' + label,
                      beam([430, sy * 40, z_bottom],
                           [430, sy * GEAR_TRACK / 2, axle_z],
                           STRUT_W, STRUT_T), GREY))
        parts.append(('wheel_' + label, wheel(
            WHEEL_D / 2, WHEEL_W,
            [430, sy * (GEAR_TRACK / 2 + WHEEL_W / 2 + 3), axle_z]), BLACK))
    parts.append(('tailwheel', wheel(
        16, 12, [1290, 0, TAIL_ZC - TAIL_H / 2 - 25])), )
    parts[-1] = ('tailwheel', parts[-1][1], BLACK)
    groups['landing_gear'] = parts

    # --- vzpery ---
    parts = []
    x_mid = WING_LE_X + 0.35 * WING_CHORD
    for sy, label in ((1, 'R'), (-1, 'L')):
        parts.append(('strut_' + label,
                      beam([x_mid, sy * 70, z_bottom + 15],
                           [x_mid, sy * (half * 0.62), WING_Z - 4],
                           STRUT_W, STRUT_T), GREY))
    groups['struts'] = parts

    # --- kryt motoru ---
    w, h, zc = former_dims(FIREWALL_X)
    groups['cowl'] = [('cowl', beam(
        [25, 0, zc - 12], [FIREWALL_X, 0, zc],
        w * 0.8, h * 0.75), RED)]

    return groups


def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'exports')
    os.makedirs(out, exist_ok=True)
    groups = build()

    scene = trimesh.Scene()
    all_meshes = []
    n = 0
    for comp, parts in groups.items():
        comp_meshes = []
        for name, mesh, color in parts:
            mesh.visual.face_colors = color
            scene.add_geometry(mesh, node_name='%s/%s' % (comp, name),
                               geom_name='%s/%s' % (comp, name))
            comp_meshes.append(mesh)
            n += 1
        combined = trimesh.util.concatenate(comp_meshes)
        combined.export(os.path.join(out, 'pc6_%s.stl' % comp))
        all_meshes.extend(comp_meshes)

    scene.export(os.path.join(out, 'pc6_porter_kit.glb'))
    trimesh.util.concatenate(all_meshes).export(
        os.path.join(out, 'pc6_porter_combined.stl'))
    print('dilu:', n)
    print('soubory:', sorted(os.listdir(out)))


if __name__ == '__main__':
    main()
